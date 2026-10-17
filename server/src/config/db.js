import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in.');
  }

  const conn = await mongoose.connect(uri);
  console.log(`[db] connected to ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}
