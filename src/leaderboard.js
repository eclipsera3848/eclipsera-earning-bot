const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const {
  pool
} = require("./database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top coin earners"),

  async execute(interaction) {
    try {
      const result = await pool.query(`
        SELECT
          discord_id,
          coins,
          total_earned
        FROM users
        ORDER BY coins DESC
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        return interaction.reply({
          content: "❌ Abhi leaderboard me koi user nahi hai.",
          ephemeral: true
        });
      }

      let description = "";

      result.rows.forEach((user, index) => {
        let medal;

        if (index === 0) {
          medal = "🥇";
        } else if (index === 1) {
          medal = "🥈";
        } else if (index === 2) {
          medal = "🥉";
        } else {
          medal = `**${index + 1}.**`;
        }

        description +=
          `${medal} <@${user.discord_id}> — 🪙 **${Number(user.coins).toLocaleString()} coins**\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🏆 Coin Leaderboard")
        .setDescription(description)
        .setFooter({
          text: "Top 10 Coin Earners"
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("❌ Leaderboard error:");
      console.error(error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Leaderboard load nahi ho saka.",
          ephemeral: true
        });
      }
    }
  }
};
