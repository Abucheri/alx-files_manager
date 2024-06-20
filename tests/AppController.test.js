import { expect, use, request } from 'chai';
import chaiHttp from 'chai-http';
import { promisify } from 'util';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import app from '../server';

use(chaiHttp);

describe('For Redis and MongoDB clients', () => {
  describe('redisClient', () => {
    it('checks if redisClient is alive', async () => {
      expect(await redisClient.isAlive()).to.be.true;
    });

    it('checks for a  non-existent key', async () => {
      expect(await redisClient.get('myKey')).to.be.null;
    });

    it('it should set a key succesfully', async () => {
      expect(await redisClient.set('myKey', 12, 1)).to.equal(undefined);
    });

    it('it should retrieve a key succesfully', async () => {
      expect(await redisClient.get('myKey')).to.equal('12');
    });

    it('it checks for an expired key', async () => {
      const setTimeOut = promisify(setTimeout);
      await setTimeOut(1200);
      expect(await redisClient.get('myKey')).to.be.null;
    });
  });

  describe('dbClient', () => {
    it('it checks if the dbClient is alive', async () => {
      expect(await dbClient.isAlive()).to.be.true;
    });
  });
});

describe('GET /status and GET /stats', () => {
  beforeEach(async () => {
    await dbClient.users.deleteMany({});
    await dbClient.files.deleteMany({});
  });
  afterEach(async () => {
    await dbClient.users.deleteMany({});
    await dbClient.files.deleteMany({});
  });

  it('it should check for the APP status', () => new Promise((done) => {
    request('http://localhost:5000')
      .get('/status')
      .end((err, response) => {
        expect(response).to.have.status(200);
        expect(response.body).to.have.property('redis').to.be.equal(true);
        expect(response.body).to.have.property('db').to.be.equal(true);
        done();
      });
  }));

  it('it should check app stats when DB is empty', () => new Promise((done) => {
    request('http://localhost:5000')
      .get('/stats')
      .end((err, response) => {
        expect(response).to.have.status(200);
        expect(response.body).to.have.property('users').to.be.equal(0);
        expect(response.body).to.have.property('files').to.be.equal(0);
        done();
      });
  }));

  it('it should check the app stats after documents upload', async () => {
    await dbClient.users.insertOne({ email: 'bob@dylan', password: 'toto1234!' });
    await dbClient.files.insertMany([
      { name: 'images', type: 'folder' },
      { name: 'myText.txt', type: 'file' },
      { name: 'image.png', type: 'image' },
    ]);

    const response = await request(app).get('/stats').send();
    expect(response).to.have.status(200);
    expect(response.body).to.have.property('users').to.be.equal(1);
    expect(response.body).to.have.property('files').to.be.equal(3);
  });
});
