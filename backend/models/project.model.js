import mongoose from 'mongoose';

const collabStateSchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    update: { type: String, required: true },
    revision: { type: Number, default: 0 },
}, { _id: false });

const projectSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        users: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            }
        ],
        fileTree: {
            type: Object,
            default: {}
        },
        collabState: {
            type: [collabStateSchema],
            default: []
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            required: true
        }
    },
    { timestamps: true }
)

// Create compound index to ensure unique project names per user
projectSchema.index({ name: 1, createdBy: 1 }, { unique: true });


const Project = mongoose.model('project', projectSchema)


export default Project;