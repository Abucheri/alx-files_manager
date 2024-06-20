import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';

chai.use(chaiHttp);

describe('FilesController Endpoint Tests', () => {
  let authToken;
  let userId;

  before(async () => {
    // Wait for the dbClient to be alive before proceeding
    while (!dbClient.isAlive()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Clear files collection
    await dbClient.db.collection('files').deleteMany({});

    // Clear all Redis data
    await redisClient.client.flushall();

    // Create a test user for authentication
    const password = 'testpassword';
    const hashedPassword = sha1(password);
    const user = await dbClient.db.collection('users').insertOne({ email: 'test@example.com', password: hashedPassword });
    userId = user.insertedId.toString();

    // Simulate user authentication and get an auth token
    const tokenKey = `auth_${uuidv4()}`;
    await redisClient.set(tokenKey, userId);
    authToken = `Bearer ${tokenKey}`; // Use the key as the token
  });

  describe('POST /files', () => {
    it('should upload a new file', async () => {
      const newFile = {
        name: 'newfile.txt',
        type: 'file',
        parentId: 0,
        isPublic: true,
        data: 'VGhpcyBpcyBhIG5ldyBmaWxl', // Base64 encoded 'This is a new file'
      };

      const response = await chai.request('http://localhost:5000')
        .post('/files')
        .set('Authorization', authToken) // Use 'Authorization' header
        .send(newFile);

      expect(response).to.have.status(201);
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('name', newFile.name);
    });

    it('should return error for missing name', async () => {
      const newFile = {
        type: 'file',
        parentId: 0,
        isPublic: true,
        data: 'VGhpcyBpcyBhIG5ldyBmaWxl', // Base64 encoded 'This is a new file'
      };

      const response = await chai.request('http://localhost:5000')
        .post('/files')
        .set('Authorization', authToken) // Use 'Authorization' header
        .send(newFile);

      expect(response).to.have.status(400);
      expect(response.body).to.have.property('error', 'Missing name');
    });

    it('should return error for missing type', async () => {
      const newFile = {
        name: 'newfile.txt',
        parentId: 0,
        isPublic: true,
        data: 'VGhpcyBpcyBhIG5ldyBmaWxl', // Base64 encoded 'This is a new file'
      };

      const response = await chai.request('http://localhost:5000')
        .post('/files')
        .set('Authorization', authToken) // Use 'Authorization' header
        .send(newFile);

      expect(response).to.have.status(400);
      expect(response.body).to.have.property('error', 'Missing type');
    });

    it('should return error for invalid parentId', async () => {
      const newFile = {
        name: 'newfile.txt',
        type: 'file',
        parentId: 'invalid',
        isPublic: true,
        data: 'VGhpcyBpcyBhIG5ldyBmaWxl', // Base64 encoded 'This is a new file'
      };

      const response = await chai.request('http://localhost:5000')
        .post('/files')
        .set('Authorization', authToken) // Use 'Authorization' header
        .send(newFile);

      expect(response).to.have.status(400);
      expect(response.body).to.have.property('error', 'Parent not found');
    });
  });

  describe('GET /files/:id', () => {
    let fileId;

    before(async () => {
      const insertedFile = await dbClient.db.collection('files').insertOne({
        userId: ObjectId(userId),
        name: 'testfile.txt',
        type: 'file',
        isPublic: true,
        parentId: 0,
      });

      fileId = insertedFile.insertedId.toString();
    });

    it('should fetch a file by ID', async () => {
      const response = await chai.request('http://localhost:5000')
        .get(`/files/${fileId}`)
        .set('Authorization', authToken);

      expect(response).to.have.status(200);
      expect(response.body).to.have.property('id', fileId);
      expect(response.body).to.have.property('name', 'testfile.txt');
    });

    it('should return error for file not found', async () => {
      const response = await chai.request('http://localhost:5000')
        .get('/files/60c72b2f9b1e8b3d6c9e1f2a') // Non-existent ID
        .set('Authorization', authToken);

      expect(response).to.have.status(404);
      expect(response.body).to.have.property('error', 'File not found');
    });

    it('should return error for unauthorized access', async () => {
      const response = await chai.request('http://localhost:5000')
        .get(`/files/${fileId}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response).to.have.status(401);
      expect(response.body).to.have.property('error', 'Unauthorized');
    });
  });

  describe('GET /files', () => {
    it('should fetch all files for the user', async () => {
      const response = await chai.request('http://localhost:5000')
        .get('/files')
        .set('Authorization', authToken);

      expect(response).to.have.status(200);
      expect(response.body).to.be.an('array');
    });

    it('should return error for unauthorized access', async () => {
      const response = await chai.request('http://localhost:5000')
        .get('/files')
        .set('Authorization', 'Bearer invalid-token');

      expect(response).to.have.status(401);
      expect(response.body).to.have.property('error', 'Unauthorized');
    });
  });

  describe('PUT /files/:id/publish', () => {
    let fileId;

    before(async () => {
      const insertedFile = await dbClient.db.collection('files').insertOne({
        userId: ObjectId(userId),
        name: 'testfile-to-publish.txt',
        type: 'file',
        isPublic: false,
        parentId: 0,
      });

      fileId = insertedFile.insertedId.toString();
    });

    it('should publish a file', async () => {
      const response = await chai.request('http://localhost:5000')
        .put(`/files/${fileId}/publish`)
        .set('Authorization', authToken);

      expect(response).to.have.status(200);
      expect(response.body).to.have.property('id', fileId);
      expect(response.body).to.have.property('isPublic', true);
    });

    it('should return error for file not found', async () => {
      const response = await chai.request('http://localhost:5000')
        .put('/files/60c72b2f9b1e8b3d6c9e1f2a/publish') // Non-existent ID
        .set('Authorization', authToken);

      expect(response).to.have.status(404);
      expect(response.body).to.have.property('error', 'Not found');
    });
  });

  describe('PUT /files/:id/unpublish', () => {
    let fileId;

    before(async () => {
      const insertedFile = await dbClient.db.collection('files').insertOne({
        userId: ObjectId(userId),
        name: 'testfile-to-unpublish.txt',
        type: 'file',
        isPublic: true,
        parentId: 0,
      });

      fileId = insertedFile.insertedId.toString();
    });

    it('should unpublish a file', async () => {
      const response = await chai.request('http://localhost:5000')
        .put(`/files/${fileId}/unpublish`)
        .set('Authorization', authToken);

      expect(response).to.have.status(200);
      expect(response.body).to.have.property('id', fileId);
      expect(response.body).to.have.property('isPublic', false);
    });

    it('should return error for file not found', async () => {
      const response = await chai.request('http://localhost:5000')
        .put('/files/60c72b2f9b1e8b3d6c9e1f2a/unpublish') // Non-existent ID
        .set('Authorization', authToken);

      expect(response).to.have.status(404);
      expect(response.body).to.have.property('error', 'Not found');
    });
  });
});
