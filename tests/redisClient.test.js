import { expect } from 'chai';
import { RedisClient } from 'redis';
import redisClient from '../utils/redis';

describe('redisClient', () => {
  it('checks the properties of redisClient', () => {
    expect(redisClient.client).to.not.be.null;
    expect(redisClient.client).to.be.instanceOf(RedisClient);
  });

  it('checking if connection is alive', () => {
    expect(redisClient.isAlive()).to.equal(true);
  });

  it('getting items', (done) => {
    (async () => {
      expect(await redisClient.get('randomKey1')).to.equal(null);
      await redisClient.set('Holberton', 'School', 1);
      const value = await redisClient.get('Holberton');
      expect(value).to.equal('School');

      setTimeout(async () => {
        expect(await redisClient.get('Holberton')).to.equal(null);
        done();
      }, 1000 * 1.01);
    })();
  });

  it('setting items', (done) => {
    (async () => {
      expect(await redisClient.get('randomKey1')).to.equal(null);
      await redisClient.set('Holberton', 'School', 3);
      const value = await redisClient.get('Holberton');
      expect(value).to.equal('School');

      setTimeout(async () => {
        expect(await redisClient.get('Holberton')).to.equal(null);
        done();
      }, 1000 * 3.01);
    })();
  }).timeout(11000);


  it('deleteing items', async () => {
    await redisClient.set('Holberton', 'School', 5);
    await redisClient.del('Holberton');
    expect(await redisClient.get('Holberton')).to.equal(null);
  });
});
