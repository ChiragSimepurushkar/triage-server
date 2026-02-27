const User = require('../models/User.model');
const Patient = require('../models/Patient.model');
const TriageSession = require('../models/TriageSession.model');

// @desc    Get all users (with search + filter)
// @route   GET /api/admin/users
const getUsers = async (req, res, next) => {
    try {
        const { search, role, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (role && role !== 'all') filter.role = role;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(filter).select('-password -refreshToken -otp -otpExpires').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: {
                users,
                total,
                pages: Math.ceil(total / parseInt(limit)),
                current: parseInt(page),
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create user (admin)
// @route   POST /api/admin/users
const createUser = async (req, res, next) => {
    try {
        const { name, email, password, role, phone } = req.body;
        const errors = [];
        if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters');
        if (!email) errors.push('Email is required');
        if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
        if (role && !['patient', 'clinician', 'admin'].includes(role)) errors.push('Role must be patient, clinician, or admin');
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: 'A user with this email already exists' });
        }

        const user = await User.create({ name: name.trim(), email, password, role: role || 'patient', phone, isEmailVerified: true });

        if (user.role === 'patient') {
            await Patient.create({ userId: user._id });
        }

        res.status(201).json({
            success: true,
            message: `User ${name} created successfully`,
            data: { user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, isActive: user.isActive, createdAt: user.createdAt } },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user (admin)
// @route   PUT /api/admin/users/:id
const updateUser = async (req, res, next) => {
    try {
        const { name, email, role, phone, isActive } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (name) user.name = name.trim();
        if (email) user.email = email;
        if (role && ['patient', 'clinician', 'admin'].includes(role)) user.role = role;
        if (phone !== undefined) user.phone = phone;
        if (isActive !== undefined) user.isActive = isActive;

        await user.save({ validateBeforeSave: false });

        res.json({
            success: true,
            message: `User ${user.name} updated successfully`,
            data: { user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, isActive: user.isActive } },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete user (admin)
// @route   DELETE /api/admin/users/:id
const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Don't allow deleting yourself
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }

        // Delete associated patient profile
        await Patient.deleteOne({ userId: user._id });
        // Delete associated triage sessions
        await TriageSession.deleteMany({ patientId: user._id });
        // Delete user
        await User.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: `User ${user.name} deleted successfully` });
    } catch (error) {
        next(error);
    }
};

// @desc    Get audit logs (admin)
// @route   GET /api/admin/logs
const getAuditLogs = async (req, res, next) => {
    try {
        const { search, page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build logs from real data — recent triage sessions + user activity
        const [sessions, users] = await Promise.all([
            TriageSession.find().populate('patientId', 'name email').populate('assignedClinician', 'name').sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.find().select('name email role createdAt isActive').sort({ createdAt: -1 }).limit(50),
        ]);

        const logs = [];

        // Generate logs from sessions
        sessions.forEach((s) => {
            logs.push({
                _id: s._id + '_created',
                action: 'TRIAGE_CREATED',
                userName: s.patientId?.name || 'Unknown',
                userEmail: s.patientId?.email || '',
                details: `Created triage session: ${s.chiefComplaint?.slice(0, 60) || 'N/A'}`,
                resource: `session/${s._id}`,
                timestamp: s.createdAt,
            });

            if (s.aiRecommendation?.processedAt) {
                logs.push({
                    _id: s._id + '_ai',
                    action: 'AI_ANALYSIS',
                    userName: 'TriageIQ AI',
                    userEmail: '',
                    details: `AI classified as ${s.aiRecommendation.urgency_label} — ${s.aiRecommendation.primary_concern?.slice(0, 60) || ''}`,
                    resource: `session/${s._id}`,
                    timestamp: s.aiRecommendation.processedAt,
                });
            }

            if (s.status === 'reviewed' && s.assignedClinician) {
                logs.push({
                    _id: s._id + '_reviewed',
                    action: 'SESSION_REVIEWED',
                    userName: s.assignedClinician?.name || 'Clinician',
                    userEmail: '',
                    details: `Reviewed and closed session for ${s.patientId?.name || 'patient'}`,
                    resource: `session/${s._id}`,
                    timestamp: s.updatedAt,
                });
            }
        });

        // Generate logs from recent user registrations
        users.forEach((u) => {
            logs.push({
                _id: u._id + '_reg',
                action: 'USER_REGISTERED',
                userName: u.name,
                userEmail: u.email,
                details: `New ${u.role} account created`,
                resource: `user/${u._id}`,
                timestamp: u.createdAt,
            });
        });

        // Sort all logs by timestamp (newest first)
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Filter by search if provided
        let filtered = logs;
        if (search) {
            const q = search.toLowerCase();
            filtered = logs.filter((l) =>
                l.action.toLowerCase().includes(q) ||
                l.userName.toLowerCase().includes(q) ||
                l.details.toLowerCase().includes(q)
            );
        }

        res.json({
            success: true,
            data: {
                logs: filtered.slice(0, parseInt(limit)),
                total: filtered.length,
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, getAuditLogs };
