const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const {
  pool
} = require("./database/database");

const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("approve")
    .setDescription("Approve a withdrawal request")

    .addIntegerOption(option =>
      option
        .setName("request_id")
        .setDescription("Withdrawal request ID")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    if (
      ADMIN_CHANNEL_ID &&
      interaction.channelId !== ADMIN_CHANNEL_ID
    ) {
      return interaction.reply({
        content:
          "❌ This command can only be used in the admin channel.",
        ephemeral: true
      });
    }

    const requestId =
      interaction.options.getInteger("request_id");

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const requestResult = await client.query(
        `
        SELECT *
        FROM requests
        WHERE id = $1
        FOR UPDATE
        `,
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return interaction.reply({
          content: `❌ Request #${requestId} was not found.`
        });
      }

      const request = requestResult.rows[0];

      if (request.status !== "PENDING") {
        await client.query("ROLLBACK");

        return interaction.reply({
          content:
            `❌ Request #${requestId} is already **${request.status}**.`
        });
      }

      await client.query(
        `
        UPDATE users
        SET reserved_coins =
          GREATEST(reserved_coins - $1, 0),
            total_spent =
          total_spent + $1
        WHERE discord_id = $2
        `,
        [
          request.coin_cost,
          request.discord_id
        ]
      );

      await client.query(
        `
        UPDATE requests
        SET
          status = 'APPROVED',
          approved_at = CURRENT_TIMESTAMP,
          approved_by = $1
        WHERE id = $2
        `,
        [
          interaction.user.id,
          requestId
        ]
      );

      await client.query(
        `
        INSERT INTO transactions
          (discord_id, type, amount, reason, request_id)
        VALUES
          ($1, 'WITHDRAW_APPROVED', $2, $3, $4)
        `,
        [
          request.discord_id,
          request.coin_cost,
          `Withdrawal approved: ${request.resource}`,
          requestId
        ]
      );

      await client.query("COMMIT");

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
      await client.query("ROLLBACK");

      console.error("❌ Approve error:", error);

      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Could not approve the request."
        });
      }

    } finally {
      client.release();
    }
  }
};
