const errorHandler = (err, req, res, _next) => {
    console.error('❌ Error:', err.message);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);

    // ── Mongoose validation error — extract field-level messages ──
    if (err.name === 'ValidationError') {
        const fieldErrors = Object.entries(err.errors).map(([field, e]) => {
            // Make friendly field names
            const labels = {
                name: 'Name', email: 'Email', password: 'Password', phone: 'Phone',
                role: 'Role', age: 'Age', gender: 'Gender', dateOfBirth: 'Date of birth',
                bloodGroup: 'Blood group', chiefComplaint: 'Chief complaint',
                bp_systolic: 'BP Systolic', bp_diastolic: 'BP Diastolic',
                heart_rate: 'Heart rate', spo2: 'SpO₂', temperature: 'Temperature',
                respiratory_rate: 'Respiratory rate', notes: 'Notes',
                finalUrgency: 'Final urgency', finalUrgencyLabel: 'Urgency label',
            };
            const label = labels[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

            // Use Mongoose's built-in message if it's useful (custom message from schema)
            if (e.message && !e.message.startsWith('Path `') && !e.message.includes('is required')) {
                return e.message;
            }

            // Build a better message based on the kind of error
            switch (e.kind) {
                case 'required': return `${label} is required`;
                case 'minlength': return `${label} must be at least ${e.properties?.minlength} characters`;
                case 'maxlength': return `${label} must be at most ${e.properties?.maxlength} characters`;
                case 'min': return `${label} must be at least ${e.properties?.min}`;
                case 'max': return `${label} must be at most ${e.properties?.max}`;
                case 'enum': return `${label} must be one of: ${e.properties?.enumValues?.join(', ') || 'valid options'}`;
                case 'regexp': return `${label} is not in a valid format`;
                default: return e.message || `${label} is invalid`;
            }
        });

        return res.status(400).json({
            success: false,
            message: fieldErrors.join('. '),
            errors: fieldErrors,
        });
    }

    // ── Mongoose duplicate key error ──
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const labels = { email: 'Email', phone: 'Phone number', name: 'Name' };
        const label = labels[field] || field;
        return res.status(400).json({
            success: false,
            message: `${label} "${err.keyValue[field]}" is already in use. Try a different one.`,
        });
    }

    // ── Mongoose cast error (bad ObjectId) ──
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: "${err.value}" is not a valid ID`,
        });
    }

    // ── JWT errors ──
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token. Please sign in again.',
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Your session has expired. Please sign in again.',
            code: 'TOKEN_EXPIRED',
        });
    }

    // ── Multer file upload errors ──
    if (err.name === 'MulterError') {
        const messages = {
            LIMIT_FILE_SIZE: 'File is too large. Maximum allowed size is 10 MB.',
            LIMIT_UNEXPECTED_FILE: 'Unexpected file field name.',
            LIMIT_FILE_COUNT: 'Too many files uploaded.',
        };
        return res.status(400).json({
            success: false,
            message: messages[err.code] || `File upload error: ${err.message}`,
        });
    }

    // ── Default ──
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
};

module.exports = { errorHandler };
