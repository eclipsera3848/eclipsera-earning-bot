const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { pool } = require("./database/database");

// =====================================
// RESOURCE RATES
// 1000 RESOURCES = COINS
// =====================================

const RESOURCE_RATES = {
  iron: {
    name: "Iron",
    emoji: "⛓️",
    coinsPer1000: 30000
  },

  water: {
    name: "Water",
    emoji: "💧",
    coinsPer1000: 20000
  },

  stone: {
    name: "Stone",
    emoji: "🪨",
    coinsPer1000: 10000
  },

  wood: {
    name: "Wood",
    emoji: "🪵",
    coinsPer1000: 7500
  },

  bread: {
    name: "Bread",
    emoji: "🍞",
    coinsPer1000: 500
  }
};

// =====================================
// COMMAND
// =====================================

module.exports = {

  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw resources using your coins"),

  // ===================================
  // /withdraw
  // ===================================

  async execute(interaction) {

    try {

      // Create table if it does not exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          resource VARCHAR(20) NOT NULL,
          amount INTEGER NOT NULL,
          nickname TEXT NOT NULL,
          coin_cost BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          approved_at TIMESTAMP,
          approved_by VARCHAR(50)
        )
      `);

      // Add columns if old table already existed
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

      // =================================
      // RESOURCE SELECT MENU
      // =================================

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("withdraw_resource")
        .setPlaceholder("Select a resource");

      for (const [key, resource] of Object.entries(
        RESOURCE_RATES
      )) {

        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(resource.name)
            .setDescription(
              `1000 ${resource.name} = ${resource.coinsPer1000.toLocaleString()} coins`
            )
            .setValue(key)
            .setEmoji(resource.emoji)
        );

      }

      const row = new ActionRowBuilder()
        .addComponents(selectMenu);

      await interaction.reply({
        content: "💸 **Select the resource you want to withdraw:**",
        components: [row],
        ephemeral: true
      });

    } catch (error) {

      console.error("Withdraw command error:", error);

      if (!interaction.replied && !interaction.deferred) {

        await interaction.reply({
          content: "❌ Withdrawal system error.",
          ephemeral: true
        });

      }

    }

  },

  // ===================================
  // ALL WITHDRAW INTERACTIONS
  // ===================================

  async handleInteraction(interaction) {

    try {

      // =================================
      // RESOURCE SELECT
      // =================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "withdraw_resource"
      ) {

        const resourceKey =
          interaction.values[0];

        const resource =
          RESOURCE_RATES[resourceKey];

        if (!resource) {

          return interaction.update({
            content: "❌ Invalid resource.",
            components: []
          });

        }

        const modal = new ModalBuilder()
          .setCustomId(
            `withdraw_modal_${resourceKey}`
          )
          .setTitle(
            `${resource.emoji} Withdraw ${resource.name}`
          );

        // Amount
        const amountInput = new TextInputBuilder()
          .setCustomId("withdraw_amount")
          .setLabel(
            `${resource.name} amount (100-1000)`
          )
          .setPlaceholder("Example: 500")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        // Nickname
        const nicknameInput = new TextInputBuilder()
          .setCustomId("game_nickname")
          .setLabel("In-Game Nickname")
          .setPlaceholder("Enter your in-game nickname")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(amountInput),

          new ActionRowBuilder()
            .addComponents(nicknameInput)

        );

        await interaction.showModal(modal);

        return;
      }

      // =================================
      // WITHDRAW MODAL
      // =================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          "withdraw_modal_"
        )
      ) {

        const resourceKey =
          interaction.customId.replace(
            "withdraw_modal_",
            ""
          );

        const resource =
          RESOURCE_RATES[resourceKey];

        if (!resource) {

          return interaction.reply({
            content: "❌ Invalid resource.",
            ephemeral: true
          });

        }

        const amountText =
          interaction.fields.getTextInputValue(
            "withdraw_amount"
          );

        const nickname =
          interaction.fields
            .getTextInputValue("game_nickname")
            .trim();

        const amount =
          Number(amountText);

        // =================================
        // VALIDATE AMOUNT
        // =================================

        if (
          !Number.isInteger(amount) ||
          amount < 100 ||
          amount > 1000
        ) {

          return interaction.reply({
            content:
              "❌ Withdrawal amount must be between **100 and 1000 resources**.",
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

        // =================================
        // CALCULATE COIN COST
        // =================================

        const coinCost =
          Math.floor(
            (amount * resource.coinsPer1000) / 1000
          );

        // =================================
        // GET USER
        // =================================

        const userResult =
          await pool.query(
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

        const balance =
          Number(userResult.rows[0].coins);

        // =================================
        // BALANCE CHECK
        // =================================

        if (coinCost > balance) {

          return interaction.reply({
            content:
              `❌ **Insufficient coins.**\n\n` +
              `💰 Required: **${coinCost.toLocaleString()} coins**\n` +
              `💳 Your balance: **${balance.toLocaleString()} coins**\n\n` +
              `${resource.emoji} ${resource.name}: **${amount.toLocaleString()}**`,
            ephemeral: true
          });

        }

        // =================================
        // TRANSACTION
        // =================================

        await pool.query("BEGIN");

        try {

          const updateResult =
            await pool.query(
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

            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Your balance changed. Please try again.",
              ephemeral: true
            });

          }

          const withdrawalResult =
            await pool.query(
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
                resourceKey,
                amount,
                nickname,
                coinCost
              ]
            );

          // Transaction record
          await pool.query(
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
              `${resource.name} withdrawal`,
              withdrawalResult.rows[0].id
            ]
          );

          await pool.query("COMMIT");

          const withdrawalId =
            withdrawalResult.rows[0].id;

          // =================================
          // ADMIN EMBED
          // =================================

          const embed =
            new EmbedBuilder()
              .setTitle(
                "💸 New Resource Withdrawal"
              )
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
                    `${resource.emoji} ${resource.name}`,
                  inline: true
                },

                {
                  name: "📊 Amount",
                  value:
                    `${amount.toLocaleString()} ${resource.name}`,
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
                  value:
                    `#${withdrawalId}`,
                  inline: true
                },

                {
                  name: "📌 Status",
                  value:
                    "⏳ Pending",
                  inline: true
                }

              )
              .setTimestamp();

          // =================================
          // BUTTONS
          // =================================

          const approveButton =
            new ButtonBuilder()
              .setCustomId(
                `withdraw_approve_${withdrawalId}`
              )
              .setLabel("Approve")
              .setEmoji("✅")
              .setStyle(
                ButtonStyle.Success
              );

          const rejectButton =
            new ButtonBuilder()
              .setCustomId(
                `withdraw_reject_${withdrawalId}`
              )
              .setLabel("Reject")
              .setEmoji("❌")
              .setStyle(
                ButtonStyle.Danger
              );

          const buttons =
            new ActionRowBuilder()
              .addComponents(
                approveButton,
                rejectButton
              );

          // =================================
          // SEND TO ADMIN
          // =================================

          const adminId =
            process.env.ADMIN_ID;

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

            } catch (dmError) {

              console.error(
                "Could not send withdrawal to admin:",
                dmError
              );

            }

          }

          // =================================
          // PLAYER RESPONSE
          // =================================

          return interaction.reply({
            content:
              `✅ **Withdrawal Request Submitted!**\n\n` +
              `${resource.emoji} Resource: **${resource.name}**\n` +
              `📦 Amount: **${amount.toLocaleString()}**\n` +
              `💰 Coins Used: **${coinCost.toLocaleString()}**\n` +
              `🎮 Nickname: **${nickname}**\n` +
              `🆔 Request ID: **#${withdrawalId}**\n\n` +
              `⏳ Waiting for admin approval.`,
            ephemeral: true
          });

        } catch (error) {

          await pool.query("ROLLBACK");

          throw error;

        }

      }

      // =================================
      // APPROVE BUTTON
      // =================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_approve_"
        )
      ) {

        const adminId =
          process.env.ADMIN_ID;

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

        const result =
          await pool.query(
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

        const withdrawal =
          result.rows[0];

        if (
          withdrawal.status !==
          "pending"
        ) {

          return interaction.reply({
            content:
              `❌ This withdrawal is already **${withdrawal.status}**.`,
            ephemeral: true
          });

        }

        await pool.query(
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

        const resource =
          RESOURCE_RATES[
            withdrawal.resource
          ];

        const approvedEmbed =
          new EmbedBuilder()
            .setTitle(
              "✅ Withdrawal Approved"
            )
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
                  `${resource?.emoji || "📦"} ${resource?.name || withdrawal.resource}`,
                inline: true
              },

              {
                name: "📊 Amount",
                value:
                  `${Number(
                    withdrawal.amount
                  ).toLocaleString()}`,
                inline: true
              },

              {
                name: "💰 Coins",
                value:
                  `${Number(
                    withdrawal.coin_cost
                  ).toLocaleString()} coins`,
                inline: true
              },

              {
                name: "🎮 Nickname",
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

        // =================================
        // PLAYER DM
        // =================================

        try {

          const player =
            await interaction.client.users.fetch(
              withdrawal.discord_id
            );

          await player.send(
            `✅ **Your withdrawal has been approved!**\n\n` +
            `📦 Resource: **${resource?.name || withdrawal.resource}**\n` +
            `📊 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()}**\n` +
            `💰 Coins Used: **${Number(
              withdrawal.coin_cost
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

      // =================================
      // REJECT BUTTON
      // =================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_reject_"
        )
      ) {

        const adminId =
          process.env.ADMIN_ID;

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

          const result =
            await pool.query(
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

          const withdrawalId =
          interaction.customId.replace(
            "withdraw_reject_",
            ""
          );

        await pool.query("BEGIN");

        try {

          const result =
            await pool.query(
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

          const withdrawal =
            result.rows[0];

          if (
            withdrawal.status !==
            "pending"
          ) {

            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });

          }

          // =================================
          // REFUND COINS
          // =================================

          await pool.query(
            `
            UPDATE users
            SET
              coins = coins + $1,
              total_spent =
                GREATEST(
                  total_spent - $1,
                  0
                )
            WHERE discord_id = $2
            `,
            [
              Number(
                withdrawal.coin_cost
              ),
              withdrawal.discord_id
            ]
          );

          // =================================
          // MARK REJECTED
          // =================================

          await pool.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          // =================================
          // REFUND TRANSACTION
          // =================================

          await pool.query(
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
                'Rejected withdrawal refund',
                $3
              )
            `,
            [
              withdrawal.discord_id,
              Number(
                withdrawal.coin_cost
              ),
              withdrawal.id
            ]
          );

          await pool.query("COMMIT");

          const resource =
            RESOURCE_RATES[
              withdrawal.resource
            ];

          const rejectedEmbed =
            new EmbedBuilder()
              .setTitle(
                "❌ Withdrawal Rejected"
              )
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
                    `${resource?.emoji || "📦"} ${resource?.name || withdrawal.resource}`,
                  inline: true
                },

                {
                  name: "📊 Amount",
                  value:
                    `${Number(
                      withdrawal.amount
                    ).toLocaleString()}`,
                  inline: true
                },

                {
                  name: "💰 Refunded",
                  value:
                    `${Number(
                      withdrawal.coin_cost
                    ).toLocaleString()} coins`,
                  inline: true
                },

                {
                  name: "🎮 Nickname",
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

          // =================================
          // PLAYER DM
          // =================================

          try {

            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ **Your withdrawal was rejected.**\n\n` +
              `📦 Resource: **${resource?.name || withdrawal.resource}**\n` +
              `📊 Amount: **${Number(
                withdrawal.amount
              ).toLocaleString()}**\n` +
              `💰 Refunded: **${Number(
                withdrawal.coin_cost
              ).toLocaleString()} coins**\n` +
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
            "❌ Something went wrong while processing withdrawal.",
          ephemeral: true
        });

      }

    }

  }

};
 
