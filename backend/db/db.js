import mongoose from "mongoose";


function connect() {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log('MongoDB connected');
        })
        .catch(err => {
            console.error('MongoDB connection failed:', err.message);
        })
}

export default connect;