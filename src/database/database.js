const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id VARCHAR(30) PRIMARY KEY,
      coins BIGINT NOT NULL DEFAULT 0,
      reserved_coins BIGINT NOT NULL DEFAULT 0,
      total_earned BIGINT NOT NULL DEFAULT 0,
      total_spent BIGINT NOT NULL DEFAULT 0,
      message_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(30) NOT NULL,
      resource VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      coin_cost BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP,
      approved_by VARCHAR(30)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(30) NOT NULL,
      type VARCHAR(30) NOT NULL,
      amount BIGINT NOT NULL,
      reason TEXT,
      request_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("✅ Database initialized successfully.");
}

async function createUser(discordId) {
  await pool.query(
    `INSERT INTO users (discord_id)
     VALUES ($1)
     ON CONFLICT (discord_id) DO NOTHING`,
    [discordId]
  );
}

async function getUser(discordId) {
  await createUser(discordId);

  const result = await pool.query(
    `SELECT * FROM users WHERE discord_id = $1`,
    [discordId]
  );

  return result.rows[0];
}

async function addCoin(discordId) {
  await createUser(discordId);

  await pool.query(
    `UPDATE users
     SET coins = coins + 1,
         total_earned = total_earned + 1,
         message_count = message_count + 1
     WHERE discord_id = $1`,
    [discordId]
  );

  await pool.query(
    `INSERT INTO transactions
     (discord_id, type, amount, reason)
     VALUES ($1, 'EARN', 1, 'Discord message')`,
    [discordId]
  );
}

module.exports = {
  pool,
  initDatabase,
  createUser,
  getUser,
  addCoin
};
