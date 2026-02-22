require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { initDb, get, run } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands, handleSlashCommand, registerSlashCommands } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { getLevelRoles } = require("./settings");
const { getIgnoredChannels } = require("./settings");
const { getLoggingExclusions } = require("./settings");
const { startDashboard } = require("./dashboard");
const unidecode = require('unidecode');

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error);
});

// ─────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────

function normalizeText(text) {
  // Custom map for special characters and symbols that resemble letters
  const customMap = {
    // Circled letters
    'Ⓐ': 'a', 'Ⓑ': 'b', 'Ⓒ': 'c', 'Ⓓ': 'd', 'Ⓔ': 'e', 'Ⓕ': 'f', 'Ⓖ': 'g', 'Ⓗ': 'h', 'Ⓘ': 'i', 'Ⓙ': 'j',
    'Ⓚ': 'k', 'Ⓛ': 'l', 'Ⓜ': 'm', 'Ⓝ': 'n', 'Ⓞ': 'o', 'Ⓟ': 'p', 'Ⓠ': 'q', 'Ⓡ': 'r', 'Ⓢ': 's', 'Ⓣ': 't',
    'Ⓤ': 'u', 'Ⓥ': 'v', 'Ⓦ': 'w', 'Ⓧ': 'x', 'Ⓨ': 'y', 'Ⓩ': 'z',
    'ⓐ': 'a', 'ⓑ': 'b', 'ⓒ': 'c', 'ⓓ': 'd', 'ⓔ': 'e', 'ⓕ': 'f', 'ⓖ': 'g', 'ⓗ': 'h', 'ⓘ': 'i', 'ⓙ': 'j',
    'ⓚ': 'k', 'ⓛ': 'l', 'ⓜ': 'm', 'ⓝ': 'n', 'ⓞ': 'o', 'ⓟ': 'p', 'ⓠ': 'q', 'ⓡ': 'r', 'ⓢ': 's', 'ⓣ': 't',
    'ⓤ': 'u', 'ⓥ': 'v', 'ⓦ': 'w', 'ⓧ': 'x', 'ⓨ': 'y', 'ⓩ': 'z',
    // Fullwidth
    'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
    'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
    'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
    // Parenthesized
    '⒜': 'a', '⒝': 'b', '⒞': 'c', '⒟': 'd', '⒠': 'e', '⒡': 'f', '⒢': 'g', '⒣': 'h', '⒤': 'i', '⒥': 'j',
    '⒦': 'k', '⒧': 'l', '⒨': 'm', '⒩': 'n', '⒪': 'o', '⒫': 'p', '⒬': 'q', '⒭': 'r', '⒮': 's', '⒯': 't',
    '⒰': 'u', '⒱': 'v', '⒲': 'w', '⒳': 'x', '⒴': 'y', '⒵': 'z',
    // Squared
    '🄰': 'a', '🄱': 'b', '🄲': 'c', '🄳': 'd', '🄴': 'e', '🄵': 'f', '🄶': 'g', '🄷': 'h', '🄸': 'i', '🄹': 'j',
    '🄺': 'k', '🄻': 'l', '🄼': 'm', '🄽': 'n', '🄾': 'o', '🄿': 'p', '🅀': 'q', '🅁': 'r', '🅂': 's', '🅃': 't',
    '🅄': 'u', '🅅': 'v', '🅆': 'w', '🅇': 'x', '🅈': 'y', '🅉': 'z',
    // Negative circled
    '🅐': 'a', '🅑': 'b', '🅒': 'c', '🅓': 'd', '🅔': 'e', '🅕': 'f', '🅖': 'g', '🅗': 'h', '🅘': 'i', '🅙': 'j',
    '🅚': 'k', '🅛': 'l', '🅜': 'm', '🅝': 'n', '🅞': 'o', '🅟': 'p', '🅠': 'q', '🅡': 'r', '🅢': 's', '🅣': 't',
    '🅤': 'u', '🅥': 'v', '🅦': 'w', '🅧': 'x', '🅨': 'y', '🅩': 'z',
    // Regional indicator (but those are flags)
    // Add specific examples if known
    '⊑': 'l', '⍜': 'o', '⌿': 'p',  // Assuming these represent l, o, p based on context
    '↳': 'l', '✺': 'o', '℘': 'p',  // New examples
    // Add more symbol mappings that resemble letters
    '↴': 'l', '↓': 'l', '←': 'l', '→': 'l', '↑': 'l',  // Arrows for l/i
    '★': 'o', '☆': 'o', '✦': 'o', '✧': 'o', '✩': 'o', '✪': 'o', '✫': 'o', '✬': 'o', '✭': 'o', '✮': 'o',  // Stars for o
    'ρ': 'p', 'π': 'p', 'φ': 'p', 'ψ': 'p',  // Greek letters resembling p
    'ι': 'i', 'ι': 'i', 'ι': 'i',  // Greek iota for i
    'α': 'a', 'β': 'b', 'γ': 'c', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'θ': 'o', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'p', 'σ': 's', 'τ': 't', 'υ': 'u', 'φ': 'p', 'χ': 'x', 'ψ': 'p', 'ω': 'o',  // Greek letters
    'а': 'a', 'б': 'b', 'в': 'b', 'г': 'r', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'h', 'о': 'o', 'п': 'p', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': 'hard', 'ы': 'y', 'ь': 'soft', 'э': 'e', 'ю': 'yu', 'я': 'ya',  // Cyrillic
    // Add more as needed
  };

  // First apply custom map, then unidecode for remaining
  let normalized = text.replace(/./g, char => customMap[char] || char);
  return unidecode(normalized);
}

// ─────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatLevelUpMessage(template, { user, level, xp }) {
  // ⚠️ MESSAGE KEPT *EXACTLY* AS REQUESTED
  return String(
    template ||
      "🎉 Congratumalations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨"
  )
    .replaceAll("{user}", user)
    .replaceAll("{level}", String(level))
    .replaceAll("{xp}", String(xp));
}

const LOG_THEME = {
  info: 0x71faf9,
  warn: 0xedd7ae,
  mod: 0xffddfc,
  neutral: 0x0a1e1e
};

function trimText(value, max = 1000) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function userLabel(userLike) {
  if (!userLike) return "Unknown";
  const user = userLike.user || userLike;
  const tag = user.tag || user.username || "Unknown";
  return `${tag} (${user.id || "no-id"})`;
}

function channelLabel(channel) {
  if (!channel) return "Unknown channel";
  return `#${channel.name || channel.id} (${channel.id})`;
}

async function getAuditExecutor(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = logs.entries.find((e) => {
      if (!e) return false;
      if (targetId && e.target?.id && e.target.id !== targetId) return false;
      const age = Date.now() - Number(e.createdTimestamp || 0);
      return age < 20_000;
    });
    return entry?.executor || null;
  } catch {
    return null;
  }
}

async function sendGuildLog(guild, payload) {
  if (!guild) return;
  const settings = await getGuildSettings(guild.id).catch(() => null);
  const channelId = settings?.log_channel_id;
  if (!channelId) return;

  const sourceIdsRaw = Array.isArray(payload?.sourceChannelIds)
    ? payload.sourceChannelIds
    : payload?.sourceChannelId
      ? [payload.sourceChannelId]
      : [];
  const sourceIds = sourceIdsRaw.filter(Boolean);

  if (sourceIds.includes(channelId)) return;

  const exclusions = await getLoggingExclusions(guild.id).catch(() => []);
  if (exclusions.length && sourceIds.length) {
    const excludedChannels = new Set(exclusions.filter((e) => e.target_type === "channel").map((e) => e.target_id));
    const excludedCategories = new Set(exclusions.filter((e) => e.target_type === "category").map((e) => e.target_id));

    for (const sourceId of sourceIds) {
      if (excludedChannels.has(sourceId)) return;
      const sourceChannel = await guild.channels.fetch(sourceId).catch(() => null);
      if (sourceChannel?.parentId && excludedCategories.has(sourceChannel.parentId)) return;
    }
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(payload.color || LOG_THEME.info)
    .setTitle(payload.title || "Server Log")
    .setDescription(trimText(payload.description || ""))
    .setTimestamp(new Date());

  if (Array.isArray(payload.fields) && payload.fields.length) {
    embed.addFields(payload.fields.slice(0, 10).map((f) => ({
      name: trimText(f.name || "Field", 200),
      value: trimText(f.value || "-", 1024),
      inline: Boolean(f.inline)
    })));
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function handleLevelUp(guild, userId, oldLevel, newLevel, message = null) {
  const settings = await getGuildSettings(guild.id);

  // Announcement if message provided
  if (message) {
    const text = formatLevelUpMessage(settings.level_up_message, {
      user: `${message.author}`,
      level: newLevel,
      xp: await get(`SELECT xp FROM user_xp WHERE guild_id=? AND user_id=?`, [guild.id, userId]).then(r => r.xp)
    });

    let targetChannel = message.channel;

    if (settings.level_up_channel_id) {
      const ch = await guild.channels
        .fetch(settings.level_up_channel_id)
        .catch(() => null);

      if (ch && typeof ch.isTextBased === "function" && ch.isTextBased()) {
        targetChannel = ch;
      }
    }

    await targetChannel.send(text).catch(() => {});
  }

  // Assign all level roles for levels <= newLevel
  const levelRoles = await getLevelRoles(guild.id);
  if (levelRoles.length) {
    try {
      const member = await guild.members.fetch(userId);
      // All roles for levels <= newLevel
      const eligibleRoles = levelRoles.filter(r => r.level <= newLevel).map(r => r.role_id);
      for (const roleId of eligibleRoles) {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (role && !member.roles.cache.has(role.id)) {
          await member.roles.add(role);
        }
      }
    } catch (e) {
      console.error("Failed to assign level roles:", e);
    }
  }
}

// ─────────────────────────────────────────────────────
// XP Helpers
// ─────────────────────────────────────────────────────

async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT INTO user_xp
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
} // ✅ THIS was missing

async function addXp(guildId, userId, amount) {
  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const newXp = row.xp + amount;
  const newLevel = levelFromXp(newXp);

  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, guildId, userId]
  );

  return {
    oldLevel: row.level,
    newLevel,
    newXp
  };
}

// ─────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ─────────────────────────────────────────────────────
// Ready
// ─────────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  try {
    await initDb();
    console.log(`Logged in as ${client.user.tag}`);

    await registerSlashCommands(client).catch((err) => {
      console.error("Slash command registration failed:", err);
    });

    startDashboard(client);

    setInterval(() => {
      cleanupPrivateRooms(client).catch((err) => {
        console.error("cleanupPrivateRooms failed:", err);
      });
    }, 30_000);

    setInterval(async () => {
      try {
        const voiceXp = parseInt(process.env.VOICE_XP_PER_MINUTE || "5", 10);

        for (const [, guild] of client.guilds.cache) {
          const ignoredChannels = await getIgnoredChannels(guild.id);
          await guild.members.fetch().catch(() => {});

          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;
            if (!member.voice?.channelId) continue;

            const isIgnored = ignoredChannels.some(c => c.channel_id === member.voice.channelId && c.channel_type === "voice");
            if (isIgnored) continue;

            const res = await addXp(guild.id, member.id, voiceXp);
            if (res.newLevel > res.oldLevel) {
              await handleLevelUp(guild, member.id, res.oldLevel, res.newLevel);
            }
          }
        }
      } catch (err) {
        console.error("Voice XP interval failed:", err);
      }
    }, 60_000);
  } catch (err) {
    console.error("ClientReady startup failed:", err);
  }
});



// ─────────────────────────────────────────────────────
// Message XP + Commands
// ─────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  // Commands first (important)
  await handleCommands(message);

  if (!message.guild || message.author.bot) return;

  console.log("[MSG]", message.guild?.id, message.channel?.id, message.author?.tag, message.content);

  // Check if channel is ignored
  const ignoredChannels = await getIgnoredChannels(message.guild.id);
  const isIgnored = ignoredChannels.some(c => c.channel_id === message.channel.id && c.channel_type === "text");
  if (isIgnored) return;

  // React to special words
  const content = message.content.toLowerCase();
  const normalizedContent = normalizeText(content);
  if (content.includes('riley')) {
    await message.react('🍪').catch(() => {});
  }
  if (content.includes('blebber')) {
    await message.react('🐢').catch(() => {});
  }
  if (content.includes('goodnight') || content.includes('good night')) {
    await message.react('<:eepy:1374218096209821757>').catch(() => {});
  }
  if (content.includes('good morning') || content.includes('goodmorning')) {
    await message.react('<:happi:1377138319049232384>').catch(() => {});
  }
  if (content.includes('bean')) {
    await message.react(':Cheesecake:').catch(() => {});
  }
  if (normalizedContent.includes('mido') || normalizedContent.includes('midory') || normalizedContent.includes('midoryi') || normalizedContent.includes('seka') || normalizedContent.includes('midoryiseka') || normalizedContent.includes('lop') || normalizedContent.includes('loppy') || normalizedContent.includes('loptube') || normalizedContent.includes('antoine')) {
    await message.react('🦝').catch(() => {});
  }

  const guildId = message.guild.id;
  const userId = message.author.id;

  const cooldownMs =
    parseInt(process.env.MESSAGE_XP_COOLDOWN_SECONDS || "60", 10) * 1000;
  const minXp = parseInt(process.env.MESSAGE_XP_MIN || "15", 10);
  const maxXp = parseInt(process.env.MESSAGE_XP_MAX || "25", 10);

  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT last_message_xp_at FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const now = Date.now();
  if (now - row.last_message_xp_at < cooldownMs) return;

  const gained = randInt(minXp, maxXp);
  const res = await addXp(guildId, userId, gained);

  await run(
    `UPDATE user_xp SET last_message_xp_at=? WHERE guild_id=? AND user_id=?`,
    [now, guildId, userId]
  );

  // ── Level-up announcement ──
  if (res.newLevel > res.oldLevel) {
    await handleLevelUp(message.guild, message.author.id, res.oldLevel, res.newLevel, message);
  }
});

// ─────────────────────────────────────────────────────
// Reaction XP
// ─────────────────────────────────────────────────────

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const msg = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!msg || !msg.guild) return;

  const guildId = msg.guild.id;
  const userId = user.id;

  const cooldownMs =
    parseInt(process.env.REACTION_XP_COOLDOWN_SECONDS || "30", 10) * 1000;
  const gained = parseInt(process.env.REACTION_XP || "3", 10);

  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT last_reaction_xp_at FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const now = Date.now();
  if (now - row.last_reaction_xp_at < cooldownMs) return;

  const res = await addXp(guildId, userId, gained);
  await run(
    `UPDATE user_xp SET last_reaction_xp_at=? WHERE guild_id=? AND user_id=?`,
    [now, guildId, userId]
  );

  if (res.newLevel > res.oldLevel) {
    await handleLevelUp(msg.guild, userId, res.oldLevel, res.newLevel);
  }
});

// ─────────────────────────────────────────────────────
// Private VC system
// ─────────────────────────────────────────────────────

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  onVoiceStateUpdate(oldState, newState, client).catch((err) => {
    console.error("VoiceStateUpdate handler error:", err);
  });
});

// ─────────────────────────────────────────────────────
// Timeout Warning for Manager
// ─────────────────────────────────────────────────────

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const MANAGER_ID = "900758140499398676"; // From commands.js
  if (newMember.id !== MANAGER_ID) return;

  // Check if timed out
  if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
    // Manager got timed out
    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 1
      });
      const log = auditLogs.entries.first();
      if (log && log.target.id === MANAGER_ID && log.executor && !log.executor.bot) {
        const executor = log.executor;
        // Send warning to a channel
        const channel = await newMember.guild.channels.fetch('1419429328592310333').catch(() => null);
        if (channel) {
          try {
            await channel.send(`<@${executor.id}> YOU HAVE JUST TIMED OUT A BOT MANAGER mind you this person will NOT be able to work on the bot while timed out`);
            console.log(`✓ Manager timeout warning sent to ${channel.name}`);
          } catch (sendErr) {
            console.error("Error sending manager timeout message:", sendErr);
          }
        } else {
          console.error("Channel 1419429328592310333 not found");
        }
      }
    } catch (err) {
      console.error("Error handling manager timeout:", err);
    }
  }
});

// ─────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set. Bot login aborted.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
  process.exit(1);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleSlashCommand(interaction);
  } catch (err) {
    console.error("Interaction handler failed:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Command failed.", ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerSlashCommands(client);
    console.log(`[slash] Synced commands after joining guild ${guild.id}`);
  } catch (err) {
    console.error("[slash] GuildCreate sync failed:", err);
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message?.guild || message.author?.bot) return;
  if (message.partial) {
    await message.fetch().catch(() => {});
  }

  const deleter = await getAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
  const deletedBy = deleter
    ? userLabel(deleter)
    : message.author
      ? `${userLabel(message.author)} (self-delete)`
      : "Unknown";
  await sendGuildLog(message.guild, {
    color: LOG_THEME.warn,
    title: "🗑️ Message Deleted",
    sourceChannelId: message.channel?.id,
    description: `A message was deleted in ${message.channel ? `<#${message.channel.id}>` : "unknown channel"}.`,
    fields: [
      { name: "Author", value: userLabel(message.author), inline: true },
      { name: "Deleted By", value: deletedBy, inline: true },
      { name: "Content", value: trimText(message.content || "(no text)") }
    ]
  });
});

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  const guild = channel?.guild;
  if (!guild) return;

  const executor = await getAuditExecutor(guild, AuditLogEvent.MessageBulkDelete, null);
  const preview = messages
    .first(5)
    .map((msg) => `${msg.author ? msg.author.username : "Unknown"}: ${trimText(msg.content || "(no text)", 120)}`)
    .join("\n");

  await sendGuildLog(guild, {
    color: LOG_THEME.warn,
    title: "🧹 Bulk Purge",
    sourceChannelId: channel?.id,
    description: `${messages.size} messages were purged in ${channel ? `<#${channel.id}>` : "unknown channel"}.`,
    fields: [
      { name: "Purged By", value: executor ? userLabel(executor) : "Unknown", inline: true },
      { name: "Message Count", value: String(messages.size), inline: true },
      { name: "Sample", value: preview || "No message preview available." }
    ]
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage?.guild) return;
  if (oldMessage.partial) await oldMessage.fetch().catch(() => {});
  if (newMessage.partial) await newMessage.fetch().catch(() => {});
  if ((oldMessage.content || "") === (newMessage.content || "")) return;
  if (newMessage.author?.bot) return;

  await sendGuildLog(newMessage.guild, {
    color: LOG_THEME.info,
    title: "✏️ Message Edited",
    sourceChannelId: newMessage.channel?.id,
    description: `A message was edited in ${newMessage.channel ? `<#${newMessage.channel.id}>` : "unknown channel"}.`,
    fields: [
      { name: "Author", value: userLabel(newMessage.author), inline: true },
      { name: "Before", value: trimText(oldMessage.content || "(no text)") },
      { name: "After", value: trimText(newMessage.content || "(no text)") }
    ]
  });
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  if (!guild || newState.member?.user?.bot) return;

  if (!oldState.channelId && newState.channelId) {
    await sendGuildLog(guild, {
      color: LOG_THEME.info,
      title: "🔊 Voice Join",
      sourceChannelId: newState.channel?.id,
      description: `${newState.member} joined ${channelLabel(newState.channel)}.`
    });
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await sendGuildLog(guild, {
      color: LOG_THEME.info,
      title: "🔇 Voice Leave",
      sourceChannelId: oldState.channel?.id,
      description: `${oldState.member} left ${channelLabel(oldState.channel)}.`
    });
    return;
  }

  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    await sendGuildLog(guild, {
      color: LOG_THEME.info,
      title: "🔁 Voice Move",
      sourceChannelIds: [oldState.channel?.id, newState.channel?.id],
      description: `${newState.member} moved from ${channelLabel(oldState.channel)} to ${channelLabel(newState.channel)}.`
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  await sendGuildLog(member.guild, {
    color: LOG_THEME.info,
    title: "📥 Member Joined",
    description: `${member} joined the server.`,
    fields: [{ name: "User", value: userLabel(member.user), inline: true }]
  });
});

client.on(Events.GuildMemberRemove, async (member) => {
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id)
    || await getAuditExecutor(member.guild, AuditLogEvent.MemberBanAdd, member.id);

  await sendGuildLog(member.guild, {
    color: LOG_THEME.warn,
    title: "📤 Member Left",
    description: `${member.user?.tag || member.id} left or was removed.`,
    fields: [
      { name: "User", value: userLabel(member.user), inline: true },
      { name: "Action By", value: executor ? userLabel(executor) : "Unknown", inline: true }
    ]
  });
});

client.on(Events.GuildBanAdd, async (ban) => {
  const executor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  await sendGuildLog(ban.guild, {
    color: LOG_THEME.mod,
    title: "⛔ Member Banned",
    description: `${userLabel(ban.user)} was banned.`,
    fields: [{ name: "Moderator", value: executor ? userLabel(executor) : "Unknown", inline: true }]
  });
});

client.on(Events.GuildBanRemove, async (ban) => {
  const executor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  await sendGuildLog(ban.guild, {
    color: LOG_THEME.mod,
    title: "✅ Member Unbanned",
    description: `${userLabel(ban.user)} was unbanned.`,
    fields: [{ name: "Moderator", value: executor ? userLabel(executor) : "Unknown", inline: true }]
  });
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.user?.bot) return;

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter((id) => !oldRoles.has(id));
  const removed = [...oldRoles].filter((id) => !newRoles.has(id));

  if (added.length || removed.length) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    await sendGuildLog(newMember.guild, {
      color: LOG_THEME.mod,
      title: "🧩 Roles Updated",
      description: `${newMember} role membership changed.`,
      fields: [
        { name: "Added", value: added.length ? added.map((id) => `<@&${id}>`).join(", ") : "None" },
        { name: "Removed", value: removed.length ? removed.map((id) => `<@&${id}>`).join(", ") : "None" },
        { name: "Updated By", value: executor ? userLabel(executor) : "Unknown", inline: true }
      ]
    });
  }

  if ((oldMember.nickname || "") !== (newMember.nickname || "")) {
    await sendGuildLog(newMember.guild, {
      color: LOG_THEME.info,
      title: "📝 Nickname Changed",
      description: `${newMember} nickname updated.`,
      fields: [
        { name: "Before", value: oldMember.nickname || "(none)", inline: true },
        { name: "After", value: newMember.nickname || "(none)", inline: true }
      ]
    });
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp || null;
  const newTimeout = newMember.communicationDisabledUntilTimestamp || null;
  if (oldTimeout !== newTimeout) {
    await sendGuildLog(newMember.guild, {
      color: LOG_THEME.mod,
      title: newTimeout ? "🔇 Member Muted" : "🔊 Member Unmuted",
      description: `${newMember} ${newTimeout ? "was muted (timed out)" : "was unmuted"}.`,
      fields: newTimeout ? [{ name: "Until", value: `<t:${Math.floor(newTimeout / 1000)}:F>` }] : []
    });
  }
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await sendGuildLog(channel.guild, {
    color: LOG_THEME.info,
    title: "➕ Channel Created",
    sourceChannelId: channel.id,
    description: `${channelLabel(channel)} was created.`
  });
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await sendGuildLog(channel.guild, {
    color: LOG_THEME.warn,
    title: "➖ Channel Deleted",
    sourceChannelId: channel.id,
    description: `${channelLabel(channel)} was deleted.`
  });
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  if (oldChannel.name === newChannel.name) return;
  await sendGuildLog(newChannel.guild, {
    color: LOG_THEME.info,
    title: "🛠️ Channel Updated",
    sourceChannelId: newChannel.id,
    description: `${channelLabel(newChannel)} was updated.`,
    fields: [
      { name: "Name", value: `${oldChannel.name || "(unknown)"} → ${newChannel.name || "(unknown)"}` }
    ]
  });
});

client.on(Events.RoleCreate, async (role) => {
  await sendGuildLog(role.guild, {
    color: LOG_THEME.mod,
    title: "🏷️ Role Created",
    description: `Role <@&${role.id}> was created.`
  });
});

client.on(Events.RoleDelete, async (role) => {
  await sendGuildLog(role.guild, {
    color: LOG_THEME.warn,
    title: "🗑️ Role Deleted",
    description: `Role ${role.name} (${role.id}) was deleted.`
  });
});

client.on(Events.RoleUpdate, async (oldRole, newRole) => {
  if (oldRole.name === newRole.name && oldRole.hexColor === newRole.hexColor) return;
  await sendGuildLog(newRole.guild, {
    color: LOG_THEME.mod,
    title: "🎨 Role Updated",
    description: `Role <@&${newRole.id}> was updated.`,
    fields: [
      { name: "Name", value: `${oldRole.name} → ${newRole.name}`, inline: true },
      { name: "Color", value: `${oldRole.hexColor} → ${newRole.hexColor}`, inline: true }
    ]
  });
});