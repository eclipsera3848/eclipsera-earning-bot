const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const {
  getUser,
  createUser,
  pool
} = require("./database/database");

// 50,000 coins = resources
const RATES = {
  bread: 10000,
  wood: 5000,
  stone: 2500,
  water: 1500,
  iron: 1000
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request resources using your coins")

    .addStringOption(option =>
      option
        .setName("resource")
        .setDescription("Choose a resource")
        .setRequired(true)
        .addChoices(
          { name: "🥖 Bread", value: "bread" },
          { name: "🪵 Wood", value: "wood" },
          { name: "🪨 Stone", value: "stone" },
          { name: "💧 Water", value: "water" },
          { name: "⛓️ Iron", value: "iron" }
        )
    )

    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount to withdraw (100-1000)")
        .setRequired(true)
        .setMinValue(MIN_AMOUNT)
        .setMaxValue(MAX_AMOUNT)
    ),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const resource = interaction.options.getString("resource");
    const amount = interaction.options.getInteger("amount");

    try {
      await createUser(discordId);

      const user = await getUser(discordId);

      if (!user) {
        return interaction.reply({
          content: "❌ User account not found.",
          ephemeral: true
        });
      }

      const resourcesPer50000 = RATES[resource];

      const coinCost = Math.ceil(
        (amount * 50000) / resourcesPer50000
      );

      const currentCoins = Number(user.coins || 0);

      if (currentCoins < coinCost) {
        return interaction.reply({
          content:
            `❌ You need **${coinCost.toLocaleString()} coins** ` +
            `but you only have **${currentCoins.toLocaleString()} coins**.`,
          ephemeral: true
        });
      }

      // Daily limit
      const dailyResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM requests
        WHERE discord_id = $1
          AND resource = $2
          AND status IN ('PENDING', 'APPROVED')
          AND created_at >= CURRENT_DATE
        `,
        [discordId, resource]
      );

      const todayAmount = Number(
        dailyResult.rows[0]?.total || 0
      );

      if (todayAmount + amount > MAX_AMOUNT) {
        const remaining = Math.max(
          0,
          MAX_AMOUNT - todayAmount
        );

        return interaction.reply({
          content:
            `❌ Daily limit reached for **${resource}**.\n` +
            `Remaining today: **${remaining}**`,
          ephemeral: true
        });
      }

      // Reserve coins
      const updateResult = await pool.query(
        `
        UPDATE users
        SET coins = coins - $1,
            reserved_coins = COALESCE(reserved_coins, 0) + $1
        WHERE discord_id = $2
          AND coins >= $1
        RETURNING coins
        `,
        [coinCost, discordId]
      );

      if (updateResult.rowCount === 0) {
        return interaction.reply({
          content:
            "❌ Your coin balance changed. Please try again.",
          ephemeral: true
        });
      }

      // Create request
      const requestResult = await pool.query(
        `
        INSERT INTO requests
          (discord_id, resource, amount, coin_cost, status)
        VALUES
          ($1, $2, $3, $4, 'PENDING')
        RETURNING id
        `,
        [
          discordId,
          resource,
          amount,
          coinCost
        ]
      );

      const requestId = requestResult.rows[0].id;

      // Transaction
      await pool.query(
        `
        INSERT INTO transactions
          (discord_id, type, amount, reason, request_id)
        VALUES
          ($1, 'WITHDRAW_RESERVE', $2, $3, $4)
        `,
        [
          discordId,
          coinCost,
          `${resource} withdrawal request`,
          requestId
        ]
      );

      // Admin channel
      if (ADMIN_CHANNEL_ID) {
        try {
          const channel =
            await interaction.client.channels.fetch(
              ADMIN_CHANNEL_ID
            );

          if (channel) {
            const embed = new EmbedBuilder()
              .setTitle("📦 New Withdrawal Request")
              .addFields(
                {
                  name: "👤 Player",
                  value: `<@${discordId}>`,
                  inline: true
                },
                {
                  name: "📦 Resource",
                  value: resource.toUpperCase(),
                  inline: true
                },
                {
                  name: "🔢 Amount",
                  value: amount.toLocaleString(),
                  inline: true
                },
                {
                  name: "🪙 Coin Cost",
                  value: coinCost.toLocaleString(),
                  inline: true
                },
                {
                  name: "🆔 Request ID",
                  value: `#${requestId}`,
                  inline: true
                },
                {
                  name: "📌 Status",
                  value: "PENDING",
                  inline: true
                }
              )
              .setTimestamp();

            await channel.send({
              embeds: [embed]
            });
          }
        } catch (channelError) {
          console.error(
            "❌ Admin channel error:",
            channelError
          );
        }
      }

      await interaction.reply({
        content:
          `✅ **Withdrawal request created!**\n\n` +
          `📦 Resource: **${resource.toUpperCase()}**\n` +
          `🔢 Amount: **${amount.toLocaleString()}**\n` +
          `🪙 Coins reserved: **${coinCost.toLocaleString()}**\n` +
          `🆔 Request ID: **#${requestId}**\n\n` +
          `⏳ Waiting for admin approval.`,
        ephemeral: true
      });

    } catch (error) {
      console.error("❌ Withdrawal error:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "❌ Something went wrong while creating your withdrawal request.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content:
            "❌ Something went wrong while creating your withdrawal request.",
          ephemeral: true
        });
      }
    }
  }
};
