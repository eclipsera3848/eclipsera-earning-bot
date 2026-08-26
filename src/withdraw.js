const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require("discord.js");

const { pool } = require("./database/database");

// ==========================================
// RESOURCE RATES
// Cost for 1,000 resources
// ==========================================

const RESOURCE_RATES = {
  iron: 30000,
  water: 20000,
  stone: 10000,
  wood: 7500,
  bread: 500
};

const RESOURCE_NAMES = {
  iron: "Iron",
  water: "Water",
  stone: "Stone",
  wood: "Wood",
  bread: "Bread"
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw your coins as game resources")

    // Resource option
    .addStringOption(option =>
      option
        .setName("resource")
        .setDescription("Choose the resource you want to withdraw")
        .setRequired(true)
        .addChoices(
          {
            name: "⛓️ Iron",
            value: "iron"
          },
          {
            name: "💧 Water",
            value: "water"
          },
          {
            name: "🪨 Stone",
            value: "stone"
          },
          {
            name: "🪵 Wood",
            value: "wood"
          },
          {
            name: "🍞 Bread",
            value: "bread"
          }
        )
    )

    // Amount option
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount of resources (100 - 1000)")
        .setRequired(true)
        .setMinValue(MIN_AMOUNT)
        .setMaxValue(MAX_AMOUNT)
    )

    // Nickname option
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("Your in-game nickname")
        .setRequired(true)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    try {
      // ==========================================
      // CREATE / UPDATE TABLE
      // ==========================================

      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          amount BIGINT NOT NULL,
          nickname TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add resource column if table already existed
      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS resource VARCHAR(20)
      `);

      // ==========================================
      // GET INPUTS
      // ==========================================

      const resource = interaction.options.getString("resource");
      const amount = interaction.options.getInteger("amount");
      const nickname = interaction.options
        .getString("nickname")
        .trim();

      // ==========================================
      // VALIDATE RESOURCE
      // ==========================================

      if (!RESOURCE_RATES[resource]) {
        return interaction.reply({
          content: "❌ Invalid resource selected.",
          ephemeral: true
        });
      }

      // ==========================================
      // VALIDATE AMOUNT
      // ==========================================

      if (
        !Number.isInteger(amount) ||
        amount < MIN_AMOUNT ||
        amount > MAX_AMOUNT
      ) {
        return interaction.reply({
          content:
            `❌ Resource amount must be between **${MIN_AMOUNT} and ${MAX_AMOUNT}**.`,
          ephemeral: true
        });
      }

      if (!nickname) {
        return interaction.reply({
          content: "❌ Please enter your in-game nickname.",
          ephemeral: true
        });
      }

      // ==========================================
      // CALCULATE COIN COST
      // ==========================================

      const rateFor1000 = RESOURCE_RATES[resource];

      // Example:
      // 1000 Iron = 30,000 coins
      // 500 Iron = 15,000 coins
      // 100 Iron = 3,000 coins

      const coinCost = Math.floor(
        (rateFor1000 * amount) / 1000
      );

      // ==========================================
      // CHECK USER BALANCE
      // ==========================================

      const userResult = await pool.query(
        `
        SELECT coins
        FROM users
        WHERE discord_id = $1
        `,
        [interaction.user.id]
      );

      if (userResult.rows.length === 0) {
        return interaction.reply({
          content:
            "❌ You don't have a coin account yet.",
          ephemeral: true
        });
      }

      const balance = Number(userResult.rows[0].coins);

      if (coinCost > balance) {
        return interaction.reply({
          content:
            `❌ Insufficient coins.\n\n` +
            `💰 Required: **${coinCost.toLocaleString()} coins**\n` +
            `💳 Your balance: **${balance.toLocaleString()} coins**`,
          ephemeral: true
        });
      }

      // ==========================================
      // START TRANSACTION
      // ==========================================

      await pool.query("BEGIN");

      try {
        // ==========================================
        // REMOVE COINS
        // ==========================================

        const updateResult = await pool.query(
          `
          UPDATE users
          SET coins = coins - $1
          WHERE discord_id = $2
            AND coins >= $1
          RETURNING coins
          `,
          [coinCost, interaction.user.id]
        );

        if (updateResult.rows.length === 0) {
          await pool.query("ROLLBACK");

          return interaction.reply({
            content:
              "❌ Your coin balance changed. Please try again.",
            ephemeral: true
          });
        }

        // ==========================================
        // CREATE WITHDRAWAL
        // ==========================================

        const withdrawalResult = await pool.query(
          `
          INSERT INTO withdrawals
            (
              discord_id,
              amount,
              nickname,
              status,
              resource
            )
          VALUES
            ($1, $2, $3, 'pending', $4)
          RETURNING id
          `,
          [
            interaction.user.id,
            amount,
            nickname,
            resource
          ]
        );

        await pool.query("COMMIT");

        const withdrawalId =
          withdrawalResult.rows[0].id;

        // ==========================================
        // CREATE ADMIN EMBED
        // ==========================================

        const embed = new EmbedBuilder()
          .setTitle("💸 New Resource Withdrawal")
          .setColor(0xF1C40F)
          .addFields(
            {
              name: "👤 Player",
              value: `<@${interaction.user.id}>`,
              inline: true
            },
            {
              name: "🎮 Resource",
              value: RESOURCE_NAMES[resource],
              inline: true
            },
            {
              name: "📦 Amount",
              value: `${amount.toLocaleString()} resources`,
              inline: true
            },
            {
              name: "💰 Coins Charged",
              value: `${coinCost.toLocaleString()} coins`,
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
          .setFooter({
            text: "Eclipsera Earning Bot"
          })
          .setTimestamp();

        // ==========================================
        // APPROVE BUTTON
        // ==========================================

        const approveButton = new ButtonBuilder()
          .setCustomId(
            `withdraw_approve_${withdrawalId}`
          )
          .setLabel("Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success);

        // ==========================================
        // REJECT BUTTON
        // ==========================================

        const rejectButton = new ButtonBuilder()
          .setCustomId(
            `withdraw_reject_${withdrawalId}`
          )
          .setLabel("Reject")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger);

        const buttons = new ActionRowBuilder()
          .addComponents(
            approveButton,
            rejectButton
          );

        // ==========================================
        // SEND TO ADMIN
        // ==========================================

        const adminId = process.env.ADMIN_ID;

        if (adminId) {
          try {
            const adminUser =
              await interaction.client.users.fetch(
                adminId
              );

            await adminUser.send({
              embeds: [embed],
              components: [buttons]
            });
          } catch (adminError) {
            console.error(
              "Could not send withdrawal to admin:",
              adminError
            );
          }
        }

        // ==========================================
        // PLAYER RESPONSE
        // ==========================================

        return interaction.reply({
          content:
            `✅ **Withdrawal Request Submitted!**\n\n` +
            `🎮 Resource: **${RESOURCE_NAMES[resource]}**\n` +
            `📦 Amount: **${amount.toLocaleString()}**\n` +
            `💰 Coins charged: **${coinCost.toLocaleString()}**\n` +
            `🎮 Nickname: **${nickname}**\n` +
            `🆔 Request ID: **#${withdrawalId}**\n\n` +
            `⏳ Waiting for admin approval.`,
          ephemeral: true
        });

      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }

    } catch (error) {
      console.error(
        "Withdraw command error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Withdrawal system error.",
          ephemeral: true
        });
      }
    }
  },

  // =====================================================
  // BUTTON HANDLER
  // =====================================================

  async handleInteraction(interaction) {
    try {

      // =================================================
      // APPROVE
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_approve_"
        )
      ) {

        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content:
              "❌ You are not allowed to approve withdrawals.",
            ephemeral: true
          });
        }

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_approve_",
            ""
          );

        const result = await pool.query(
          `
          SELECT *
          FROM withdrawals
          WHERE id = $1
          `,
          [withdrawalId]
        );

        if (result.rows.length === 0) {
          return interaction.reply({
            content:
              "❌ Withdrawal request not found.",
            ephemeral: true
          });
        }

        const withdrawal = result.rows[0];

        if (withdrawal.status !== "pending") {
          return interaction.reply({
            content:
              `❌ This withdrawal is already **${withdrawal.status}**.`,
            ephemeral: true
          });
        }

        // Mark approved
        await pool.query(
          `
          UPDATE withdrawals
          SET status = 'approved'
          WHERE id = $1
          `,
          [withdrawalId]
        );

        const resourceName =
          RESOURCE_NAMES[withdrawal.resource] ||
          withdrawal.resource ||
          "Resource";

        const approvedEmbed =
          new EmbedBuilder()
            .setTitle("✅ Withdrawal Approved")
            .setColor(0x2ECC71)
            .addFields(
              {
                name: "👤 Player",
                value: `<@${withdrawal.discord_id}>`,
                inline: true
              },
              {
                name: "🎮 Resource",
                value: resourceName,
                inline: true
              },
              {
                name: "📦 Amount",
                value:
                  `${Number(
                    withdrawal.amount
                  ).toLocaleString()} resources`,
                inline: true
              },
              {
                name: "🎮 In-Game Nickname",
                value: withdrawal.nickname,
                inline: false
              },
              {
                name: "🆔 Request ID",
                value: `#${withdrawal.id}`,
                inline: true
              },
              {
                name: "📌 Status",
                value: "✅ Approved",
                inline: true
              }
            )
            .setTimestamp();

        await interaction.update({
          embeds: [approvedEmbed],
          components: []
        });

        // DM PLAYER
        try {
          const player =
            await interaction.client.users.fetch(
              withdrawal.discord_id
            );

          await player.send(
            `✅ **Your withdrawal has been approved!**\n\n` +
            `🎮 Resource: **${resourceName}**\n` +
            `📦 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()}**\n` +
            `🎮 Nickname: **${withdrawal.nickname}**\n` +
            `🆔 Request ID: **#${withdrawal.id}**`
          );

        } catch (error) {
          console.error(
            "Could not DM player:",
            error
          );
        }

        return;
      }

      // =================================================
      // REJECT
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_reject_"
        )
      ) {

        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content:
              "❌ You are not allowed to reject withdrawals.",
            ephemeral: true
          });
        }

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_reject_",
            ""
          );

        await pool.query("BEGIN");

        try {

          // Lock withdrawal row
          const result = await pool.query(
            `
            SELECT *
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
          );

          if (result.rows.length === 0) {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          const withdrawal = result.rows[0];

          if (withdrawal.status !== "pending") {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });
          }

          // ============================================
          // REFUND COINS
          // ============================================

          const resource = withdrawal.resource;

          const rateFor1000 =
            RESOURCE_RATES[resource];

          const refundCoins = rateFor1000
            ? Math.floor(
                (rateFor1000 *
                  Number(withdrawal.amount)) /
                  1000
              )
            : 0;

          if (refundCoins > 0) {
            await pool.query(
              `
              UPDATE users
              SET coins = coins + $1
              WHERE discord_id = $2
              `,
              [
                refundCoins,
                withdrawal.discord_id
              ]
            );
          }

          // ============================================
          // MARK REJECTED
          // ============================================

          await pool.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          await pool.query("COMMIT");

          const resourceName =
            RESOURCE_NAMES[resource] ||
            resource ||
            "Resource";

          const rejectedEmbed =
            new EmbedBuilder()
              .setTitle("❌ Withdrawal Rejected")
              .setColor(0xE74C3C)
              .addFields(
                {
                  name: "👤 Player",
                  value: `<@${withdrawal.discord_id}>`,
                  inline: true
                },
                {
                  name: "🎮 Resource",
                  value: resourceName,
                  inline: true
                },
                {
                  name: "📦 Amount",
                  value:
                    `${Number(
                      withdrawal.amount
                    ).toLocaleString()} resources`,
                  inline: true
                },
                {
                  name: "💰 Coins Refunded",
                  value:
                    `${refundCoins.toLocaleString()} coins`,
                  inline: true
                },
                {
                  name: "🎮 In-Game Nickname",
                  value: withdrawal.nickname,
                  inline: false
                },
                {
                  name: "🆔 Request ID",
                  value: `#${withdrawal.id}`,
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

          // DM PLAYER
          try {

            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ **Your withdrawal was rejected.**\n\n` +
              `🎮 Resource: **${resourceName}**\n` +
              `📦 Amount: **${Number(
                withdrawal.amount
              ).toLocaleString()}**\n` +
              `💰 Coins refunded: **${refundCoins.toLocaleString()}**\n` +
              `🎮 Nickname: **${withdrawal.nickname}**\n` +
              `🆔 Request ID: **#${withdrawal.id}**`
            );

          } catch (error) {
            console.error(
              "Could not DM player:",
              error
            );
          }

          return;

        } catch (error) {

          await pool.query("ROLLBACK");
          throw error;
        }
      }

    } catch (error) {

      console.error(
        "Withdrawal interaction error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Something went wrong while processing the withdrawal.",
          ephemeral: true
        });
      }
    }
  }
};
