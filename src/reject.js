const { SlashCommandBuilder } = require("discord.js");

const { pool } = require("../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reject")
    .setDescription("Reject a withdrawal request")
    .addIntegerOption(option =>
      option
        .setName("request_id")
        .setDescription("Withdrawal request ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.user.id !== process.env.ADMIN_USER_ID) {
      return interaction.reply({
        content: "❌ You are not authorized to reject requests.",
        ephemeral: true
      });
    }

    const requestId =
      interaction.options.getInteger("request_id");

    try {
      const result = await pool.query(
        `SELECT * FROM requests WHERE id = $1`,
        [requestId]
      );

      if (result.rows.length === 0) {
        return interaction.reply({
          content: `❌ Request #${requestId} was not found.`,
          ephemeral: true
        });
      }

      const request = result.rows[0];

      if (request.status !== "PENDING") {
        return interaction.reply({
          content:
            `❌ Request #${requestId} is already **${request.status}**.`,
          ephemeral: true
        });
      }

      // Return reserved coins to player
      await pool.query(
        `
        UPDATE users
        SET coins = coins + $1,
            reserved_coins = reserved_coins - $1
        WHERE discord_id = $2
        `,
        [request.coin_cost, request.discord_id]
      );

      // Mark request rejected
      await pool.query(
        `
        UPDATE requests
        SET status = 'REJECTED',
            approved_by = $1
        WHERE id = $2
        `,
        [interaction.user.id, requestId]
      );

      // Save transaction
      await pool.query(
        `
        INSERT INTO transactions
          (discord_id, type, amount, reason, request_id)
        VALUES
          ($1, 'WITHDRAW_REJECTED', $2, $3, $4)
        `,
        [
          request.discord_id,
          request.coin_cost,
          `${request.resource} withdrawal rejected - coins returned`,
          requestId
        ]
      );

      await interaction.reply({
        content:
          `❌ **Request #${requestId} rejected.**\n\n` +
          `👤 Player: <@${request.discord_id}>\n` +
          `📦 Resource: **${request.resource.toUpperCase()}**\n` +
          `🔢 Amount: **${request.amount}**\n` +
          `🪙 **${Number(request.coin_cost).toLocaleString()} coins returned.**`
      });

    } catch (error) {
      console.error("❌ Reject error:", error);

      await interaction.reply({
        content:
          "❌ Something went wrong while rejecting the request.",
        ephemeral: true
      });
    }
  }
};
