import Bull from 'bull';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';
import generateImageThumbnails from './utils/thumbnailGenerator';

// Create Bull queue instance
const fileQueue = new Bull('fileQueue');

// Process the queue
fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const userObjectId = ObjectId(userId);

  // Find the file in the database
  const fileDocument = await dbClient.db.collection('files').findOne({
    _id: ObjectId(fileId),
    userId: userObjectId,
  });

  if (!fileDocument) {
    throw new Error('File not found');
  }

  // Generate thumbnails and update file paths in DB
  const filePath = fileDocument.localPath;

  try {
    await generateImageThumbnails(filePath);

    // Update the file paths in the database with new thumbnail paths if necessary
    await dbClient.db.collection('files').updateOne(
      { _id: ObjectId(fileId) },
      {
        $set: {
          localPath_500: `${filePath}_500`,
          localPath_250: `${filePath}_250`,
          localPath_100: `${filePath}_100`,
        },
      },
    );
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    throw new Error('Thumbnail generation failed');
  }
});

// Create Bull queue instance for user-related tasks (e.g., sending welcome emails)
const userQueue = new Bull('userQueue');

// Process the user queue
userQueue.process('sendWelcomeEmail', async (job) => {
  const { userId } = job.data;

  if (!userId) {
    throw new Error('Missing userId');
  }

  const userObjectId = ObjectId(userId);

  // Find the user in the database
  const user = await dbClient.db.collection('users').findOne({ _id: userObjectId });

  if (!user) {
    throw new Error('User not found');
  }

  console.log(`Welcome ${user.email}!`);
  // In a real application, you would send an actual email here
  // using a service like SendGrid or Mailgun
  // Example: sendWelcomeEmail(user.email);

  return true; // Job completion
});

export default {
  fileQueue,
  userQueue,
};
