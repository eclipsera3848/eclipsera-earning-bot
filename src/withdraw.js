const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { pool } = require("./database/database");

// =====================================================
// RESOURCE RATES
// coins required for 1 resource
// =====================================================

const RESOURCE_RATES = {
  iron: 30,
  water: 20,
  stone: 10,
  wood: 7.5,
  bread: 0.5
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


// =====================================================
// COMMAND
// =====================================================

module.exports = {

  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request a resource withdrawal")

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

    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount of resources (100 - 1000)")
        .setRequired(true)
        .setMinValue(MIN_AMOUNT)
        .setMaxValue(MAX_AMOUNT)
    ),


  // =====================================================
  // /WITHDRAW EXECUTE
  // =====================================================

  async execute(interaction) {

    try {

      // Create table if it does not exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          resource VARCHAR(20) NOT NULL DEFAULT 'iron',
          amount INTEGER NOT NULL,
          coins_cost NUMERIC NOT NULL DEFAULT 0,
          nickname TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add missing columns to old table
      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS resource VARCHAR(20) NOT NULL DEFAULT 'iron'
      `);

      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS coins_cost NUMERIC NOT NULL DEFAULT 0
      `);


      // Get selected values
      const resource =
        interaction.options.getString("resource");

      const amount =
        interaction.options.getInteger("amount");


      // Validate resource
      if (!RESOURCE_RATES[resource]) {

        return interaction.reply({
          content: "❌ Invalid resource selected.",
          flags: 64
        });

      }


      // Validate amount
      if (
        !Number.isInteger(amount) ||
        amount < MIN_AMOUNT ||
        amount > MAX_AMOUNT
      ) {

        return interaction.reply({
          content:
            `❌ Withdrawal amount must be between **${MIN_AMOUNT} and ${MAX_AMOUNT} resources**.`,
          flags: 64
        });

      }


      // Calculate coins
      const rate = RESOURCE_RATES[resource];

      const coinsCost = amount * rate;


      // Check user balance
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
          flags: 64
        });

      }


      const balance =
        Number(userResult.rows[0].coins);


      if (balance < coinsCost) {

        return interaction.reply({
          content:
            `❌ Insufficient coins.\n\n` +
            `💰 Required: **${coinsCost.toLocaleString()} coins**\n` +
            `💳 Your balance: **${balance.toLocaleString()} coins**\n\n` +
            `📦 Resource: **${RESOURCE_NAMES[resource]}**\n` +
            `📊 Amount: **${amount.toLocaleString()}**`,
          flags: 64
        });

      }


      // =================================================
      // Store selected withdrawal temporarily in modal ID
      // =================================================

      const modal = new ModalBuilder()
        .setCustomId(
          `withdraw_modal_${resource}_${amount}`
        )
        .setTitle("💸 Withdrawal Request");


      const nicknameInput = new TextInputBuilder()
        .setCustomId("game_nickname")
        .setLabel("In-Game Nickname")
        .setPlaceholder("Enter your in-game nickname")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);


      modal.addComponents(
        new ActionRowBuilder().addComponents(
          nicknameInput
        )
      );


      await interaction.showModal(modal);

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
          flags: 64
        });

      }

    }

  },


  // =====================================================
  // HANDLE INTERACTIONS
  // =====================================================

  async handleInteraction(interaction) {

    try {


      // =================================================
      // WITHDRAW MODAL
      // =================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("withdraw_modal_")
      ) {

        // -----------------------------------------------
        // Get resource and amount from modal ID
        // -----------------------------------------------

        const parts =
          interaction.customId.split("_");

        const resource = parts[2];

        const amount =
          Number(parts[3]);


        // -----------------------------------------------
        // Validate resource
        // -----------------------------------------------

        if (!RESOURCE_RATES[resource]) {

          return interaction.reply({
            content:
              "❌ Invalid withdrawal resource.",
            flags: 64
          });

        }


        // -----------------------------------------------
        // Validate amount
        // -----------------------------------------------

        if (
          !Number.isInteger(amount) ||
          amount < MIN_AMOUNT ||
          amount > MAX_AMOUNT
        ) {

          return interaction.reply({
            content:
              `❌ Amount must be between **${MIN_AMOUNT} and ${MAX_AMOUNT} resources**.`,
            flags: 64
          });

        }


        // -----------------------------------------------
        // Get nickname safely
        // -----------------------------------------------

        let nickname = "";

        try {

          nickname =
            interaction.fields.getTextInputValue(
              "game_nickname"
            );

        } catch (error) {

          console.error(
            "Nickname field error:",
            error
          );

          return interaction.reply({
            content:
              "❌ Nickname field is missing. Please run `/withdraw` again.",
            flags: 64
          });

        }


        nickname =
          String(nickname || "").trim();


        if (!nickname) {

          return interaction.reply({
            content:
              "❌ Please enter your in-game nickname.",
            flags: 64
          });

        }


        // -----------------------------------------------
        // Calculate cost
        // -----------------------------------------------

        const rate =
          RESOURCE_RATES[resource];

        const coinsCost =
          amount * rate;


        // -----------------------------------------------
        // Get player balance
        // -----------------------------------------------

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
            flags: 64
          });

        }


        const balance =
          Number(userResult.rows[0].coins);


        if (balance < coinsCost) {

          return interaction.reply({
            content:
              `❌ Insufficient coins.\n\n` +
              `💰 Required: **${coinsCost.toLocaleString()} coins**\n` +
              `💳 Your balance: **${balance.toLocaleString()} coins**`,
            flags: 64
          });

        }


        // =================================================
        // TRANSACTION
        // =================================================

        await pool.query("BEGIN");

        try {

          // Deduct coins
          const updateResult =
            await pool.query(
              `
              UPDATE users
              SET coins = coins - $1
              WHERE discord_id = $2
                AND coins >= $1
              RETURNING coins
              `,
              [
                coinsCost,
                interaction.user.id
              ]
            );


          if (updateResult.rows.length === 0) {

            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Your balance changed. Please try again.",
              flags: 64
            });

          }


          // Create withdrawal
          const withdrawalResult =
            await pool.query(
              `
              INSERT INTO withdrawals
                (
                  discord_id,
                  resource,
                  amount,
                  coins_cost,
                  nickname,
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
                coinsCost,
                nickname
              ]
            );


          await pool.query("COMMIT");


          const withdrawalId =
            withdrawalResult.rows[0].id;


          // =================================================
          // ADMIN EMBED
          // =================================================

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
                    RESOURCE_NAMES[resource],
                  inline: true
                },

                {
                  name: "📊 Amount",
                  value:
                    `${amount.toLocaleString()} resources`,
                  inline: true
                },

                {
                  name: "💰 Coins",
                  value:
                    `${coinsCost.toLocaleString()} coins`,
                  inline: true
                },

                {
                  name: "🎮 In-Game Nickname",
                  value:
                    nickname,
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

              .setFooter({
                text:
                  "Eclipsera Earning System"
              })

              .setTimestamp();


          // =================================================
          // BUTTONS
          // =================================================

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


          // =================================================
          // SEND TO ADMIN
          // =================================================

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


            } catch (adminError) {

              console.error(
                "Could not send withdrawal request to admin:",
                adminError
              );

            }

          }


          // =================================================
          // PLAYER RESPONSE
          // =================================================

          return interaction.reply({

            content:
              `✅ **Withdrawal request submitted!**\n\n` +

              `📦 Resource: **${RESOURCE_NAMES[resource]}**\n` +

              `📊 Amount: **${amount.toLocaleString()}**\n` +

              `💰 Coins used: **${coinsCost.toLocaleString()}**\n` +

              `🎮 Nickname: **${nickname}**\n` +

              `🆔 Request ID: **#${withdrawalId}**\n\n` +

              `⏳ Waiting for admin approval.`,

            flags: 64

          });


        } catch (error) {

          await pool.query("ROLLBACK");

          throw error;

        }

      }


      // =================================================
      // APPROVE BUTTON
      // =================================================

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
            flags: 64
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
            flags: 64
          });

        }


        const withdrawal =
          result.rows[0];


        if (
          withdrawal.status !== "pending"
        ) {

          return interaction.reply({
            content:
              `❌ This withdrawal is already **${withdrawal.status}**.`,
            flags: 64
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
                  RESOURCE_NAMES[
                    withdrawal.resource
                  ] ||
                  withdrawal.resource,
                inline: true
              },

              {
                name: "📊 Amount",
                value:
                  `${Number(
                    withdrawal.amount
                  ).toLocaleString()} resources`,
                inline: true
              },

              {
                name: "💰 Coins",
                value:
                  `${Number(
                    withdrawal.coins_cost
                  ).toLocaleString()} coins`,
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


        // DM player
        try {

          const player =
            await interaction.client.users.fetch(
              withdrawal.discord_id
            );


          await player.send(

            `✅ **Your withdrawal has been approved!**\n\n` +

            `📦 Resource: **${
              RESOURCE_NAMES[
                withdrawal.resource
              ] || withdrawal.resource
            }**\n` +

            `📊 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()}**\n` +

            `💰 Coins: **${Number(
              withdrawal.coins_cost
            ).toLocaleString()}**\n` +

            `🎮 In-Game Nickname: **${withdrawal.nickname}**\n` +

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
      // REJECT BUTTON
      // =================================================

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
            flags: 64
          });

        }


        const withdrawal =
            result.rows[0];

          if (
            withdrawal.status !== "pending"
          ) {

            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              flags: 64
            });

          }

          // Refund coins
          await pool.query(
            `
            UPDATE users
            SET coins = coins + $1
            WHERE discord_id = $2
            `,
            [
              Number(
                withdrawal.coins_cost
              ),
              withdrawal.discord_id
            ]
          );

          // Mark rejected
          await pool.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          await pool.query("COMMIT");

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
                    RESOURCE_NAMES[
                      withdrawal.resource
                    ] ||
                    withdrawal.resource,
                  inline: true
                },
                {
                  name: "📊 Amount",
                  value:
                    `${Number(
                      withdrawal.amount
                    ).toLocaleString()} resources`,
                  inline: true
                },
                {
                  name: "💰 Refunded",
                  value:
                    `${Number(
                      withdrawal.coins_cost
                    ).toLocaleString()} coins`,
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

          // DM player
          try {

            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ **Your withdrawal was rejected.**\n\n` +
              `📦 Resource: **${
                RESOURCE_NAMES[
                  withdrawal.resource
                ] || withdrawal.resource
              }**\n` +
              `📊 Amount: **${Number(
                withdrawal.amount
              ).toLocaleString()}**\n` +
              `💰 Refunded: **${Number(
                withdrawal.coins_cost
              ).toLocaleString()} coins**\n` +
              `🎮 In-Game Nickname: **${withdrawal.nickname}**\n` +
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
          flags: 64
        });
      }
    }
  }
};
