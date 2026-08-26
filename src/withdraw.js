const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { pool } = require("./database/database");

// ============================================================
// RESOURCE PRICES
// 1000 resources = this many coins
// ============================================================

const RESOURCES = {
  iron: {
    name: "Iron",
    emoji: "⛓️",
    maxCoins: 30000
  },

  water: {
    name: "Water",
    emoji: "💧",
    maxCoins: 20000
  },

  stone: {
    name: "Stone",
    emoji: "🪨",
    maxCoins: 10000
  },

  wood: {
    name: "Wood",
    emoji: "🪵",
    maxCoins: 7500
  },

  bread: {
    name: "Bread",
    emoji: "🍞",
    maxCoins: 500
  }
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

// ============================================================
// CALCULATE COIN COST
// ============================================================

function calculateCost(resource, amount) {
  const resourceData = RESOURCES[resource];

  if (!resourceData) {
    throw new Error("Invalid resource.");
  }

  const costPerResource =
    resourceData.maxCoins / MAX_AMOUNT;

  return Math.ceil(costPerResource * amount);
}

// ============================================================
// CREATE WITHDRAWALS TABLE
// ============================================================

async function initWithdrawalsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      discord_id VARCHAR(50) NOT NULL,
      resource VARCHAR(20),
      amount INTEGER NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      coin_cost BIGINT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP,
      approved_by VARCHAR(50)
    )
  `);

  // Existing installations may already have withdrawals table.
  // Add missing columns without destroying existing data.

  await pool.query(`
    ALTER TABLE withdrawals
    ADD COLUMN IF NOT EXISTS resource VARCHAR(20)
  `);

  await pool.query(`
    ALTER TABLE withdrawals
    ADD COLUMN IF NOT EXISTS coin_cost BIGINT
  `);

  await pool.query(`
    ALTER TABLE withdrawals
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE withdrawals
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(50)
  `);
}

// ============================================================
// SLASH COMMAND
// ============================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw Iron, Water, Stone, Wood or Bread"),

  // ==========================================================
  // /withdraw
  // ==========================================================

  async execute(interaction) {
    try {
      await initWithdrawalsTable();

      const menu = new StringSelectMenuBuilder()
        .setCustomId("withdraw_resource")
        .setPlaceholder("Select a resource to withdraw")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Iron")
            .setDescription("1000 Iron = 30,000 coins")
            .setEmoji("⛓️")
            .setValue("iron"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Water")
            .setDescription("1000 Water = 20,000 coins")
            .setEmoji("💧")
            .setValue("water"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Stone")
            .setDescription("1000 Stone = 10,000 coins")
            .setEmoji("🪨")
            .setValue("stone"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Wood")
            .setDescription("1000 Wood = 7,500 coins")
            .setEmoji("🪵")
            .setValue("wood"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Bread")
            .setDescription("1000 Bread = 500 coins")
            .setEmoji("🍞")
            .setValue("bread")
        );

      const row = new ActionRowBuilder()
        .addComponents(menu);

      await interaction.reply({
        content:
          "💸 **Withdraw Resources**\n\n" +
          "Select the resource you want to withdraw.\n" +
          "Minimum: **100**\n" +
          "Maximum: **1000**",
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error("❌ Withdraw command error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Withdrawal system error.",
          ephemeral: true
        });
      }
    }
  },

  // ==========================================================
  // ALL WITHDRAW INTERACTIONS
  // ==========================================================

  async handleInteraction(interaction) {
    try {

      // ======================================================
      // RESOURCE SELECT MENU
      // ======================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "withdraw_resource"
      ) {
        const resource = interaction.values[0];

        if (!RESOURCES[resource]) {
          return interaction.reply({
            content: "❌ Invalid resource selected.",
            ephemeral: true
          });
        }

        const data = RESOURCES[resource];

        const modal = new ModalBuilder()
          .setCustomId(`withdraw_modal_${resource}`)
          .setTitle(`${data.emoji} Withdraw ${data.name}`);

        const amountInput = new TextInputBuilder()
          .setCustomId("withdraw_amount")
          .setLabel("Resource Amount")
          .setPlaceholder("Enter 100 - 1000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(4);

        const nicknameInput = new TextInputBuilder()
          .setCustomId("game_nickname")
          .setLabel("In-Game Nickname")
          .setPlaceholder("Enter your in-game nickname")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(nicknameInput)
        );

        await interaction.showModal(modal);

        return;
      }

      // ======================================================
      // WITHDRAW MODAL
      // ======================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("withdraw_modal_")
      ) {
        const resource =
          interaction.customId.replace(
            "withdraw_modal_",
            ""
          );

        if (!RESOURCES[resource]) {
          return interaction.reply({
            content: "❌ Invalid resource.",
            ephemeral: true
          });
        }

        const amountText =
          interaction.fields.getTextInputValue(
            "withdraw_amount"
          ).trim();

        const nickname =
          interaction.fields
            .getTextInputValue("game_nickname")
            .trim();

        // ----------------------------------------------------
        // VALIDATE AMOUNT
        // ----------------------------------------------------

        if (!/^\d+$/.test(amountText)) {
          return interaction.reply({
            content:
              "❌ Amount must be a whole number.",
            ephemeral: true
          });
        }

        const amount = Number(amountText);

        if (
          !Number.isInteger(amount) ||
          amount < MIN_AMOUNT ||
          amount > MAX_AMOUNT
        ) {
          return interaction.reply({
            content:
              `❌ Invalid amount.\n\n` +
              `Minimum: **${MIN_AMOUNT}**\n` +
              `Maximum: **${MAX_AMOUNT}**`,
            ephemeral: true
          });
        }

        if (!nickname) {
          return interaction.reply({
            content:
              "❌ Please enter your in-game nickname.",
            ephemeral: true
          });
        }

        // ----------------------------------------------------
        // CALCULATE COST
        // ----------------------------------------------------

        const coinCost =
          calculateCost(resource, amount);

        const resourceData =
          RESOURCES[resource];

        // ----------------------------------------------------
        // START TRANSACTION
        // ----------------------------------------------------

        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          // --------------------------------------------------
          // LOCK USER ROW
          // --------------------------------------------------

          const userResult = await client.query(
            `
            SELECT coins
            FROM users
            WHERE discord_id = $1
            FOR UPDATE
            `,
            [interaction.user.id]
          );

          if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ You don't have a coin account yet.",
              ephemeral: true
            });
          }

          const balance =
            Number(userResult.rows[0].coins);

          // --------------------------------------------------
          // CHECK BALANCE
          // --------------------------------------------------

          if (balance < coinCost) {
            await client.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ **Insufficient balance.**\n\n` +
                `💰 Required: **${coinCost.toLocaleString()} coins**\n` +
                `💰 Your balance: **${balance.toLocaleString()} coins**\n\n` +
                `${resourceData.emoji} Resource: **${amount.toLocaleString()} ${resourceData.name}**`,
              ephemeral: true
            });
          }

          // --------------------------------------------------
          // DEDUCT COINS
          // --------------------------------------------------

          const updateResult = await client.query(
            `
            UPDATE users
            SET
              coins = coins - $1,
              total_spent = total_spent + $1
            WHERE discord_id = $2
              AND coins >= $1
            RETURNING coins
            `,
            [
              coinCost,
              interaction.user.id
            ]
          );

          if (updateResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Your balance changed. Please try again.",
              ephemeral: true
            });
          }

          // --------------------------------------------------
          // CREATE WITHDRAWAL
          // --------------------------------------------------

          const withdrawalResult =
            await client.query(
              `
              INSERT INTO withdrawals
                (
                  discord_id,
                  resource,
                  amount,
                  nickname,
                  coin_cost,
                  status
                )
              VALUES
                ($1, $2, $3, $4, $5, 'pending')
              RETURNING id
              `,
              [
                interaction.user.id,
                resource,
                amount,
                nickname,
                coinCost
              ]
            );

          const withdrawalId =
            withdrawalResult.rows[0].id;

          // --------------------------------------------------
          // TRANSACTION LOG
          // --------------------------------------------------

          await client.query(
            `
            INSERT INTO transactions
              (
                discord_id,
                type,
                amount,
                reason,
                request_id
              )
            VALUES
              (
                $1,
                'WITHDRAW',
                $2,
                $3,
                $4
              )
            `,
            [
              interaction.user.id,
              coinCost,
              `${resourceData.name} withdrawal: ${amount}`,
              withdrawalId
            ]
          );

          await client.query("COMMIT");

          client.release();

          // --------------------------------------------------
          // ADMIN EMBED
          // --------------------------------------------------

          const embed =
            new EmbedBuilder()
              .setTitle("💸 New Withdrawal Request")
              .setColor(0xF1C40F)
              .addFields(
                {
                  name: "👤 Player",
                  value:
                    `<@${interaction.user.id}>`,
                  inline: true
                },
                {
                  name: "📦 Resource",
                  value:
                    `${resourceData.emoji} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "📦 Amount",
                  value:
                    `${amount.toLocaleString()} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "💰 Coin Cost",
                  value:
                    `${coinCost.toLocaleString()} coins`,
                  inline: true
                },
                {
                  name: "🎮 In-Game Nickname",
                  value: nickname,
                  inline: false
                },
                {
                  name: "🆔 Withdrawal ID",
                  value: `#${withdrawalId}`,
                  inline: true
                },
                {
                  name: "📌 Status",
                  value: "⏳ Pending",
                  inline: true
                }
              )
              .setTimestamp();

          const approveButton =
            new ButtonBuilder()
              .setCustomId(
                `withdraw_approve_${withdrawalId}`
              )
              .setLabel("Approve")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success);

          const rejectButton =
            new ButtonBuilder()
              .setCustomId(
                `withdraw_reject_${withdrawalId}`
              )
              .setLabel("Reject")
              .setEmoji("❌")
              .setStyle(ButtonStyle.Danger);

          const buttons =
            new ActionRowBuilder()
              .addComponents(
                approveButton,
                rejectButton
              );

          // --------------------------------------------------
          // SEND TO ADMIN
          // --------------------------------------------------

          // ==========================================
// SEND REQUEST IN CHANNEL
// ==========================================

try {
  // Send the withdrawal request publicly in the channel
await interaction.channel.send({
  content:
    `🚨 **NEW WITHDRAWAL REQUEST**\n` +
    `<@${interaction.user.id}> has requested a withdrawal.`,
  embeds: [embed],
  components: [buttons]
});

// Private confirmation for the player
return interaction.reply({
  content:
    `✅ **Withdrawal request submitted!**\n\n` +
    `${resourceData.emoji} Resource: **${amount.toLocaleString()} ${resourceData.name}**\n` +
    `💰 Cost: **${coinCost.toLocaleString()} coins**\n` +
    `🎮 Nickname: **${nickname}**\n` +
    `🆔 Request ID: **#${withdrawalId}**\n\n` +
    `⏳ Waiting for approval.`,
  ephemeral: true
});

} catch (channelError) {
  console.error(
    "❌ Could not send withdrawal request to channel:"
  );

  console.error(channelError);
}

          // --------------------------------------------------
          // PLAYER RESPONSE
          // --------------------------------------------------

          return interaction.reply({
            content:
              `✅ **Withdrawal request submitted!**\n\n` +
              `${resourceData.emoji} Resource: **${amount.toLocaleString()} ${resourceData.name}**\n` +
              `💰 Cost: **${coinCost.toLocaleString()} coins**\n` +
              `🎮 Nickname: **${nickname}**\n` +
              `🆔 Request ID: **#${withdrawalId}**\n\n` +
              `⏳ Waiting for admin approval.`,
          });

        } catch (error) {

          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              "Rollback error:",
              rollbackError
            );
          }

          client.release();

          throw error;
        }
      }

      // ======================================================
      // APPROVE
      // ======================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_approve_"
        )
      ) {
        const adminId = process.env.ADMIN_ID;

if (!adminId || interaction.user.id !== adminId) {
  return interaction.reply({
    content: "❌ Only the bot administrator can approve withdrawals.",
    ephemeral: true
  });
}

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_approve_",
            ""
          );

        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const result =
            await client.query(
              `
              SELECT *
              FROM withdrawals
              WHERE id = $1
              FOR UPDATE
              `,
              [withdrawalId]
            );

          if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content:
                "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          const withdrawal =
            result.rows[0];

          if (
            withdrawal.status !== "pending"
          ) {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });
          }

          await client.query(
            `
            UPDATE withdrawals
            SET
              status = 'approved',
              approved_at = CURRENT_TIMESTAMP,
              approved_by = $1
            WHERE id = $2
            `,
            [
              interaction.user.id,
              withdrawalId
            ]
          );

          await client.query("COMMIT");
          client.release();

          const resourceData =
            RESOURCES[withdrawal.resource] || {
              name: withdrawal.resource,
              emoji: "📦"
            };

          const approvedEmbed =
            new EmbedBuilder()
              .setTitle("✅ Withdrawal Approved")
              .setColor(0x2ECC71)
              .addFields(
                {
                  name: "👤 Player",
                  value:
                    `<@${withdrawal.discord_id}>`,
                  inline: true
                },
                {
                  name: "📦 Resource",
                  value:
                    `${resourceData.emoji} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "📦 Amount",
                  value:
                    `${Number(withdrawal.amount).toLocaleString()} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "💰 Coins",
                  value:
                    `${Number(withdrawal.coin_cost).toLocaleString()} coins`,
                  inline: true
                },
                {
                  name: "🎮 In-Game Nickname",
                  value:
                    withdrawal.nickname,
                  inline: false
                },
                {
                  name: "🆔 Request ID",
                  value:
                    `#${withdrawal.id}`,
                  inline: true
                },
                {
                  name: "📌 Status",
                  value:
                    "✅ Approved",
                  inline: true
                }
              )
              .setTimestamp();

          await interaction.update({
            embeds: [approvedEmbed],
            components: []
          });

          // --------------------------------------------------
          // PLAYER DM
          // --------------------------------------------------

          try {
            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `✅ **Your withdrawal has been approved!**\n\n` +
              `${resourceData.emoji} Resource: **${Number(withdrawal.amount).toLocaleString()} ${resourceData.name}**\n` +
              `💰 Cost: **${Number(withdrawal.coin_cost).toLocaleString()} coins**\n` +
              `🎮 Nickname: **${withdrawal.nickname}**\n` +
              `🆔 Request ID: **#${withdrawal.id}**`
            );

          } catch (dmError) {
            console.error(
              "❌ Could not DM player:",
              dmError
            );
          }

          return;
        } catch (error) {

          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              "Rollback error:",
              rollbackError
            );
          }

          client.release();

          throw error;
        }
      }

      // ======================================================
      // REJECT
      // ======================================================

if (
  interaction.isButton() &&
  interaction.customId.startsWith("withdraw_reject_")
) {
  const adminId = process.env.ADMIN_ID;

  if (!adminId || interaction.user.id !== adminId) {
    return interaction.reply({
      content: "❌ Only the bot administrator can reject withdrawals.",
      ephemeral: true
    });
  }

  const withdrawalId = interaction.customId.replace(
    "withdraw_reject_",
    ""
  );

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_reject_",
            ""
          );

        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const result =
            await client.query(
              `
              SELECT *
              FROM withdrawals
              WHERE id = $1
              FOR UPDATE
              `,
              [withdrawalId]
            );

          if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content:
                "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          const withdrawal =
            result.rows[0];

          if (
            withdrawal.status !== "pending"
          ) {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });
          }

          // --------------------------------------------------
          // REFUND COINS
          // --------------------------------------------------

          await client.query(
            `
            UPDATE users
            SET coins = coins + $1
            WHERE discord_id = $2
            `,
            [
              Number(withdrawal.coin_cost),
              withdrawal.discord_id
            ]
          );

          // --------------------------------------------------
          // UPDATE WITHDRAWAL
          // --------------------------------------------------

          await client.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          // --------------------------------------------------
          // REFUND TRANSACTION LOG
          // --------------------------------------------------

          await client.query(
            `
            INSERT INTO transactions
              (
                discord_id,
                type,
                amount,
                reason,
                request_id
              )
            VALUES
              (
                $1,
                'REFUND',
                $2,
                'Withdrawal rejected - coins refunded',
                $3
              )
            `,
            [
              withdrawal.discord_id,
              Number(withdrawal.coin_cost),
              withdrawalId
            ]
          );

          await client.query("COMMIT");
          client.release();

          const resourceData =
            RESOURCES[withdrawal.resource] || {
              name: withdrawal.resource,
              emoji: "📦"
            };

          const rejectedEmbed =
            new EmbedBuilder()
              .setTitle("❌ Withdrawal Rejected")
              .setColor(0xE74C3C)
              .addFields(
                {
                  name: "👤 Player",
                  value:
                    `<@${withdrawal.discord_id}>`,
                  inline: true
                },
                {
                  name: "📦 Resource",
                  value:
                    `${resourceData.emoji} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "📦 Amount",
                  value:
                    `${Number(withdrawal.amount).toLocaleString()} ${resourceData.name}`,
                  inline: true
                },
                {
                  name: "💰 Refunded",
                  value:
                    `${Number(withdrawal.coin_cost).toLocaleString()} coins`,
                  inline: true
                },
                {
                  name: "🎮 In-Game Nickname",
                  value:
                    withdrawal.nickname,
                  inline: false
                },
                {
                  name: "🆔 Request ID",
                  value:
                    `#${withdrawal.id}`,
                  inline: true
                },
                {
                  name: "📌 Status",
                  value:
                    "❌ Rejected — Coins Refunded",
                  inline: false
                }
              )
              .setTimestamp();

          await interaction.update({
            embeds: [rejectedEmbed],
            components: []
          });

          // --------------------------------------------------
          // PLAYER DM
          // --------------------------------------------------

          try {
            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ **Your withdrawal was rejected.**\n\n` +
              `${resourceData.emoji} Resource: **${Number(withdrawal.amount).toLocaleString()} ${resourceData.name}**\n` +
              `💰 Refunded: **${Number(withdrawal.coin_cost).toLocaleString()} coins**\n` +
              `🎮 Nickname: **${withdrawal.nickname}**\n` +
              `🆔 Request ID: **#${withdrawal.id}**`
            );

          } catch (dmError) {
            console.error(
              "❌ Could not DM player:",
              dmError
            );
          }

          return;

        } catch (error) {

          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              "Rollback error:",
              rollbackError
            );
          }

          client.release();

          throw error;
        }
      }

    
  }
};
            
