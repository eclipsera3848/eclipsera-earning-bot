const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { getUser } = require("../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your Eclipsera coin balance"),

  async execute(interaction) {
    try {
      const user = await getUser(interaction.user.id);

      const coins = Number(user.coins);
      const messages = Number(user.message_count);

      const embed = new EmbedBuilder()
        .setTitle("💰 Eclipsera Balance")
        .setDescription(
          `**${interaction.user.username}**, here is your balance.`
        )
        .addFields(
          {
            name: "🪙 Coins",
            value: `**${coins.toLocaleString()}**`,
            inline: true
          },
          {
            name: "💬 Messages",
            value: `**${messages.toLocaleString()}**`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });
    } catch (error) {
      console.error("❌ Balance command error:", error);

      await interaction.reply({
        content: "❌ Something went wrong while checking your balance.",
        ephemeral: true
      });
    }
  }
};
