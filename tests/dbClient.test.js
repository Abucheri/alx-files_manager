import { expect } from 'chai';
import dbClient from '../utils/db';

describe('DB Client Tests', () => {
  it('should connect to MongoDB', (done) => {
    setTimeout(() => {
      expect(dbClient.db).to.not.be.false;
      done();
    }, 1000);
  });

  it('should check if DB client is alive', () => {
    const alive = dbClient.isAlive();
    expect(alive).to.equal(true);
  });

  it('should fetch number of users', async () => {
    const count = await dbClient.nbUsers();
    expect(count).to.be.a('number');
  });

  it('should fetch number of files', async () => {
    const count = await dbClient.nbFiles();
    expect(count).to.be.a('number');
  });
});
