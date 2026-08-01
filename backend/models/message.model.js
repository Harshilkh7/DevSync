import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
    {
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'project',
            required: true,
            index: true
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            default: null
        },
        senderType: {
            type: String,
            enum: [ 'user', 'ai' ],
            default: 'user'
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 20000
        }
    },
    { timestamps: true }
);

messageSchema.index({ project: 1, createdAt: 1 });

const Message = mongoose.model('message', messageSchema);

export default Message;