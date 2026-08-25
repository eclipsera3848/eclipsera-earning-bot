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

const { pool } = require("../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Create a withdrawal request")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount of coins to withdraw")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");

    const modal = new ModalBuilder()
      .setCustomId(`withdraw_modal_${amount}`)
      .setTitle("Withdrawal Request");

    const nicknameInput = new TextInputBuilder()
      .setCustomId("nickname")
      .setLabel("In-Game Nickname")
      .setPlaceholder("Enter your in-game nickname")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(nicknameInput);

    modal.addComponents(row);

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith("withdraw_modal_")) {
      return false;
    }

    const amount = Number(
      interaction.customId.replace("withdraw_modal_", "")
    );

    const nickname = interaction.fields
      .getTextInputValue("nickname")
      .trim();

    if (!nickname) {
      await interaction.reply({
        content: "❌ Please enter your in-game nickname.",
        ephemeral: true
      });

      return true;
    }

    const discordId = interaction.user.id;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `
        SELECT coins, reserved_coins
        FROM users
        WHERE discord_id = $1
        FOR UPDATE
        `,
        [discordId]
      );

      if (userResult.rows.length === 0) {
        await client.query(
          `
          INSERT INTO users (discord_id)
          VALUES ($1)
          ON CONFLICT (discord_id) DO NOTHING
          `,
          [discordId]
        );

        await client.query("ROLLBACK");

        await interaction.reply({
          content: "❌ Your account was not found. Please try again.",
          ephemeral: true
        });

        return true;
      }

      const user = userResult.rows[0];
      const coins = Number(user.coins);

      if (coins < amount) {
        await client.query("ROLLBACK");

        await interaction.reply({
          content:
            `❌ You don't have enough coins.\n` +
            `Your balance: **${coins.toLocaleString()}**\n` +
            `Requested: **${amount.toLocaleString()}**`,
          ephemeral: true
        });

        return true;
      }

      const requestResult = await client.query(
        `
        INSERT INTO requests
          (discord_id, resource, amount, coin_cost, status)
        VALUES
          ($1, $2, $3, $4, 'PENDING')
        RETURNING id
        `,
        [
          discordId,
          nickname,
          amount,
          amount
        ]
      );

      const requestId = requestResult.rows[0].id;

      await client.query(
        `
        UPDATE users
        SET
          coins = coins - $1,
          reserved_coins = reserved_coins + $1
        WHERE discord_id = $2
        `,
        [amount, discordId]
      );

      await client.query(
        `
        INSERT INTO transactions
          (discord_id, type, amount, reason, request_id)
        VALUES
          ($1, 'WITHDRAW_RESERVE', $2, $3, $4)
        `,
        [
          discordId,
          amount,
          `Withdrawal request for ${nickname}`,
          requestId
        ]
      );

      await client.query("COMMIT");

      const embed = new EmbedBuilder()
        .setTitle("💸 New Withdrawal Request")
        .setColor(0x5865f2)
        .addFields(
          {
            name: "👤 Discord User",
            value: `<@${discordId}>`,
            inline: true
          },
          {
            name: "🎮 In-Game Nickname",
            value: nickname,
            inline: true
          },
          {
            name: "🪙 Amount",
            value: `${amount.toLocaleString()} coins`,
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
        .setFooter({
          text: "Withdrawal request"
        })
        .setTimestamp();

      const approveButton = new ButtonBuilder()
        .setCustomId(`withdraw_approve_${requestId}`)
        .setLabel("Approve")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

      const rejectButton = new ButtonBuilder()
        .setCustomId(`withdraw_reject_${requestId}`)
        .setLabel("Reject")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

      const buttons = new ActionRowBuilder().addComponents(
        approveButton,
        rejectButton
      );

      // IMPORTANT:
      // This reply is NOT ephemeral.
      // Everyone in the channel can see the request.
      await interaction.reply({
        embeds: [embed],
        components: [buttons]
      });

      return true;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error("❌ Withdrawal error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Could not create the withdrawal request.",
          ephemeral: true
        });
      }

      return true;
    } finally {
      client.release();
    }
  }
};
