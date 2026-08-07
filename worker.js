import Queue from 'bull';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import thumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
    const { fileId, userId } = job.data;

    if (!fileId) {
        throw new Error('Missing fileId');
    }

    if (!userId) {
        throw new Error('Missing userId');
    }

    const file = await dbClient.db
        .collection('files')
        .findOne({
            _id: new ObjectId(fileId),
            userId: new ObjectId(userId),
        });

    if (!file) {
        throw new Error('File not found');
    }

    const sizes = [500, 250, 100];

    for (const size of sizes) {
        const thumb = await thumbnail(file.localPath, {
            width: size,
        });

        await fs.promises.writeFile(
            `${file.localPath}_${size}`,
            thumb,
        );
    }
});

console.log('Worker started');