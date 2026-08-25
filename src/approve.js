const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { pool } = require("./database/database");

const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("approve")
    .setDescription("Approve a pending withdrawal request")
    .addIntegerOption(option =>
      option
        .setName("request_id")
        .setDescription("Withdrawal request ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Admin permission
      if (!interaction.memberPermissions?.has("Administrator")) {
        return interaction.reply({
          content: "❌ Sirf admin ye command use kar sakta hai.",
          ephemeral: true
        });
      }

      const requestId = interaction.options.getInteger("request_id");

      // Request find karo
      const result = await pool.query(
        `
        SELECT *
        FROM requests
        WHERE id = $1
        `,
        [requestId]
      );

      if (result.rows.length === 0) {
        return interaction.reply({
          content: `❌ Request #${requestId} nahi mili.`,
          ephemeral: true
        });
      }

      const request = result.rows[0];

      // Already processed?
      if (request.status !== "PENDING") {
        return interaction.reply({
          content:
            `❌ Request #${requestId} already **${request.status}** hai.`,
          ephemeral: true
        });
      }

      // Approve request
      await pool.query(
        `
        UPDATE requests
        SET status = 'APPROVED',
            approved_at = CURRENT_TIMESTAMP,
            approved_by = $1
        WHERE id = $2
        `,
        [interaction.user.id, requestId]
      );

      // Reserved coins release karo
      await pool.query(
        `
        UPDATE users
        SET reserved_coins =
          GREATEST(reserved_coins - $1, 0),
            total_spent =
          total_spent + $1
        WHERE discord_id = $2
        `,
        [request.coin_cost, request.discord_id]
      );

      // Transaction
      await pool.query(
        `
        INSERT INTO transactions
        (discord_id, type, amount, reason, request_id)
        VALUES
        ($1, 'WITHDRAW_APPROVED', $2, $3, $4)
        `,
        [
          request.discord_id,
          request.coin_cost,
          `Approved ${request.resource} withdrawal`,
          requestId
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Withdrawal Approved")
        .addFields(
          {
            name: "🆔 Request",
            value: `#${requestId}`,
            inline: true
          },
          {
            name: "👤 Player",
            value: `<@${request.discord_id}>`,
            inline: true
          },
          {
            name: "📦 Resource",
            value: request.resource.toUpperCase(),
            inline: true
          },
          {
            name: "🔢 Amount",
            value: Number(request.amount).toLocaleString(),
            inline: true
          },
          {
            name: "🪙 Coins",
            value: Number(request.coin_cost).toLocaleString(),
            inline: true
          },
          {
            name: "👮 Approved By",
            value: `<@${interaction.user.id}>`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("❌ Approve error:");
      console.error(error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Request approve nahi ho saki.",
          ephemeral: true
        });
      }
    }
  }
};
