import { kafka } from './kafka.client.js';
import { logger } from '../../common/utils/logger.js';

let admin = null;

function getAdmin() {
  if (!admin) {
    admin = kafka.admin();
  }
  return admin;
}

/**
 * Startup check verifying Kafka broker connectivity.
 * @returns {Promise<boolean>}
 */
export async function verifyKafkaConnectivity() {
  const client = getAdmin();
  try {
    await client.connect();
    const cluster = await client.describeCluster();
    logger.info({ brokers: cluster.brokers.length, clusterId: cluster.clusterId }, 'Kafka broker connectivity verified');
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Kafka broker unreachable during startup check');
    return false;
  }
}

/**
 * Checks for missing topics and creates them with default partitions and replication.
 * @param {string[]} topics - Array of topic names
 */
export async function ensureTopicsExist(topics = []) {
  const client = getAdmin();
  try {
    await client.connect();
    const existing = await client.listTopics();
    const toCreate = topics.filter((t) => !existing.includes(t));

    if (toCreate.length > 0) {
      await client.createTopics({
        topics: toCreate.map((t) => ({ topic: t, numPartitions: 3, replicationFactor: 1 }))
      });
      logger.info({ created: toCreate }, 'Created missing Kafka topics');
    }
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to create Kafka topics');
    return false;
  }
}

/**
 * Disconnects the Kafka admin client.
 */
export async function disconnectAdmin() {
  if (admin) {
    await admin.disconnect();
    admin = null;
    logger.info('Kafka admin disconnected gracefully');
  }
}
