import Bull from 'bull';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import dbClient from './db';

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }
  if (!userId) {
    throw new Error('Missing userId');
  }

  const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId });
  if (!fileDocument) {
    throw new Error('File not found');
  }

  const filePath = fileDocument.localPath;
  const options = { responseType: 'buffer' };

  const sizes = [500, 250, 100];
  await Promise.all(sizes.map(async (size) => {
    const thumbnail = await imageThumbnail(filePath, { ...options, width: size });
    fs.writeFileSync(`${filePath}_${size}`, thumbnail);
  }));

  done();
});

export default fileQueue;
