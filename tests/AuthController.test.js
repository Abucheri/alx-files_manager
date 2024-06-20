import { expect, use, request } from 'chai';
import chaiHttp from 'chai-http';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import app from '../server';

use(chaiHttp);

describe('tests Authentication endpoints', () => {
  const user = {
    email: 'bob@dylan.com',
    password: 'toto1234!',
  };
  let token = '';

  describe('it tests: GET /users/me, GET /connect, GET/disconnect', () => {
    before(async () => {
      await dbClient.users.deleteMany({});
    });

    after(async () => {
      await dbClient.users.deleteMany({});
    });

    it('it should return an Unauthorized error with status code 401 without a token', async () => {
      const response = await request('http://localhost:5000').get('/users/me').send();
      expect(response.status).to.equal(401);
    });

    it('it should return an Unauthorized error with status code 401 with a wrong token', async () => {
      const response = await request('http://localhost:5000')
        .get('/users/me')
        .set('X-Token', '031bffac-3edc-4e51-aaae-1c121317da8a')
        .send();
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error').to.be.equal('Unauthorized');
    });

    it('it should return an Unauthorized error with status code 401 with wrong credentials', async () => {
      const response = await request('http://localhost:5000')
        .get('/connect')
        .auth('fake@email', 'fakeP4ss')
        .send();
      expect(response.status).to.equal(401);
      expect(response.body).to.eql({ error: 'Unauthorized' });
    });

    it('it should sign-in the user by generating an authentication token', async () => {
      const newUserResp = await request('http://localhost:5000').post('/users').send(user);
      const { id } = newUserResp.body;

      const response = await request('http://localhost:5000')
        .get('/connect')
        .auth(user.email, user.password)
        .send();
      token = response.body.token;

      const redisKey = await redisClient.get(`auth_${token}`);

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('token');
      expect(redisKey).to.equal(id);
    });

    it('it should sign-out the user based on the token', async () => {
      await request(app).get('/disconnect').set('X-Token', token).send();
      expect(await redisClient.get(`auth_${token}`)).to.be.null;
    });
  });
});
