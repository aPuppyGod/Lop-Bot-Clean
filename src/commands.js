// src/commands.js
// Prefix commands for Lop Bot (XP + MEE6 import + Private VC controls)

const { get, all, run } = require("./db");
const { levelFromXp, progressFromTotalXp } = require("./xp");
const { getGuildSettings } = require("./settings");

// ====== CONFIG ======
const PREFIX = "!";
const MANAGER_ID = "900758140499398676"; // you (manager override)

// If you want to permanently disable claim-all after first run, keep this true.
// (It will still allow the manager to re-run if you manually re-enable in DB by deleting the flag.)
const LOCK_CLAIM_ALL_AFTER_RUN = true;

// ====== PERMS ======
function isManager(userId) {
  return userId === MANAGER_ID;
}

function hasAdminPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  if (member.guild && member.guild.ownerId === member.id) return true;
  return member.permissions?.has?.("Administrator") || false;
}

function hasModPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  return (
    member.permissions?.has?.("ModerateMembers") ||
    member.permissions?.has?.("ManageGuild") ||
    member.permissions?.has?.("Administrator")
  );
}

// ====== UTIL ======
function parseArgs(content) {
  // Splits by spaces while keeping quoted strings
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && /\s/.test(ch)) {
      if (cur.length) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
}

async function setUserXp(guildId, userId, totalXp) {
  await ensureUserRow(guildId, userId);
  const lvl = levelFromXp(totalXp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [totalXp, lvl, guildId, userId]
  );
  return { xp: totalXp, level: lvl };
}

async function addUserXp(guildId, userId, deltaXp) {
  await ensureUserRow(guildId, userId);
  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
  const newXp = (row?.xp || 0) + deltaXp;
  const newLevel = levelFromXp(newXp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, guildId, userId]
  );
  return { oldLevel: row?.level || 0, newLevel, newXp };
}

async function getRankPosition(guildId, userId) {
  const rows = await all(
    `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC, user_id ASC`,
    [guildId]
  );
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

async function getUserRow(guildId, userId) {
  await ensureUserRow(guildId, userId);
  return await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function bestDisplayName(member) {
  // nickname/displayName is best for matching, but we’ll also check username/globalName
  const u = member.user;
  return (
    member.displayName ||
    u.globalName ||
    u.username ||
    ""
  );
}

// ====== PRIVATE VC HELPERS ======
async function getRoomByTextChannel(guildId, textChannelId) {
  return await get(
    `SELECT * FROM private_voice_rooms WHERE guild_id=? AND text_channel_id=?`,
    [guildId, textChannelId]
  );
}

async function fetchVoiceChannel(guild, channelId) {
  return await guild.channels.fetch(channelId).catch(() => null);
}

// ====== CLAIM-ALL LOCK FLAG (stored in guild_settings) ======
async function ensureClaimFlagColumn() {
  // harmless if already exists; ignore errors
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN claim_all_done INTEGER DEFAULT 0`);
  } catch (_) {}
}

async function getClaimAllDone(guildId) {
  await ensureClaimFlagColumn();
  await run(`INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`, [guildId]);
  const row = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
  return (row?.claim_all_done || 0) === 1;
}

async function setClaimAllDone(guildId, done) {
  await ensureClaimFlagColumn();
  await run(`UPDATE guild_settings SET claim_all_done=? WHERE guild_id=?`, [done ? 1 : 0, guildId]);
}

// ====== COMMANDS ======
async function cmdRank(message, args) {
  const guildId = message.guild.id;

  const target =
    message.mentions.users.first() ||
    message.author;

  const row = await getUserRow(guildId, target.id);
  const pos = await getRankPosition(guildId, target.id);

  const prog = progressFromTotalXp(row.xp);

  await message.channel.send(
    `🏅 **Rank for ${target.username}**\n` +
    `• Rank: **#${pos ?? "?"}**\n` +
    `• Level: **${prog.level}**\n` +
    `• XP: **${prog.xpIntoLevel} / ${prog.xpToNext}** (Total: **${prog.totalXp}**)`
  );
}

async function cmdLeaderboard(message, args) {
  const guildId = message.guild.id;
  const page = clamp(parseInt(args[0] || "1", 10) || 1, 1, 999);

  const perPage = 10;
  const offset = (page - 1) * perPage;

  const rows = await all(
    `SELECT user_id, xp FROM user_xp WHERE guild_id=? ORDER BY xp DESC, user_id ASC LIMIT ? OFFSET ?`,
    [guildId, perPage, offset]
  );

  if (!rows.length) {
    return message.channel.send("No leaderboard data yet.");
  }

  // Resolve users to names
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const member = await message.guild.members.fetch(r.user_id).catch(() => null);
    const name = member ? bestDisplayName(member) : `User ${r.user_id}`;
    const lvl = levelFromXp(r.xp);
    lines.push(
      `${offset + i + 1}. **${name}** — Level **${lvl}** (${r.xp} XP)`
    );
  }

  await message.channel.send(`🏆 **Leaderboard (Page ${page})**\n` + lines.join("\n"));
}

async function cmdXp(message, args) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;
  const sub = (args[0] || "").toLowerCase();

  if (sub !== "set" && sub !== "add") {
    return message.channel.send(
      `Usage:\n` +
      `• \`!xp set @user <totalXP>\`\n` +
      `• \`!xp add @user <amount>\``
    );
  }

  const user = message.mentions.users.first();
  if (!user) return message.reply("Tag a user: `!xp set @user 5000`");

  const amount = parseInt(args[2], 10);
  if (!Number.isFinite(amount) || amount < 0) return message.reply("Enter a valid number.");

  if (sub === "set") {
    const res = await setUserXp(guildId, user.id, amount);
    return message.channel.send(`✅ Set ${user} to **${res.xp} XP** (Level **${res.level}**).`);
  } else {
    const res = await addUserXp(guildId, user.id, amount);
    return message.channel.send(`✅ Added **${amount} XP** to ${user}. Total: **${res.newXp}** (Level **${res.newLevel}**).`);
  }
}

async function cmdImportMee6(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to do this.");
  }

  const guildId = message.guild.id;

  const fs = require("fs");
  const path = require("path");
  const snapshotPath = path.join(__dirname, "..", "data", "mee6_snapshot.json");

  if (!fs.existsSync(snapshotPath)) {
    return message.reply("❌ `data/mee6_snapshot.json` not found on server.");
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch (e) {
    return message.reply("❌ Snapshot JSON is invalid.");
  }

  if (!Array.isArray(data)) {
    return message.reply("❌ Snapshot must be an array.");
  }

  let inserted = 0;

  for (const row of data) {
    if (!row.username || typeof row.xp !== "number") continue;

    await run(
      `INSERT OR REPLACE INTO mee6_snapshot
       (guild_id, snapshot_username, snapshot_xp, snapshot_level)
       VALUES (?, ?, ?, ?)`,
      [
        guildId,
        String(row.username),
        Number(row.xp),
        Number(row.level || 0)
      ]
    );

    inserted++;
  }

  await message.channel.send(
    `✅ Imported **${inserted}** MEE6 rows.\n` +
    `Next step: run \`!claim-all\` to apply XP to members.`
  );
}

async function cmdClaimAll(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;

  // Optional one-time lock
  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    const done = await getClaimAllDone(guildId);
    if (done && !isManager(message.author.id)) {
      return message.reply("❌ `!claim-all` has already been run once on this server.");
    }
  }

  // Make sure we have all members cached for matching
  await message.guild.members.fetch().catch(() => {});

  const snapshots = await all(
    `SELECT snapshot_username, snapshot_xp, claimed_user_id
     FROM mee6_snapshot WHERE guild_id=?`,
    [guildId]
  );

  if (!snapshots.length) {
    return message.reply("No MEE6 snapshot found in the database.");
  }

  let matched = 0;
  let skipped = 0;
  let already = 0;

  // Build lookup maps for quick matching
  const members = Array.from(message.guild.members.cache.values()).filter((m) => !m.user.bot);

  const byUsername = new Map();
  const byDisplay = new Map();
  const byGlobal = new Map();

  for (const m of members) {
    const u = m.user;
    const un = normalizeName(u.username);
    const dn = normalizeName(m.displayName);
    const gn = normalizeName(u.globalName);

    if (un) {
      if (!byUsername.has(un)) byUsername.set(un, []);
      byUsername.get(un).push(m);
    }
    if (dn) {
      if (!byDisplay.has(dn)) byDisplay.set(dn, []);
      byDisplay.get(dn).push(m);
    }
    if (gn) {
      if (!byGlobal.has(gn)) byGlobal.set(gn, []);
      byGlobal.get(gn).push(m);
    }
  }

  await message.channel.send(
    `⏳ Starting \`!claim-all\`... This will match snapshot usernames to current members by name.\n` +
    `If a name matches multiple people or nobody, it will be skipped.`
  );

  for (const s of snapshots) {
    if (s.claimed_user_id) {
      already++;
      continue;
    }

    const key = normalizeName(s.snapshot_username);
    const candidates =
      (byUsername.get(key) || []).concat(byGlobal.get(key) || []).concat(byDisplay.get(key) || []);

    // Deduplicate candidates
    const uniq = new Map();
    for (const c of candidates) uniq.set(c.id, c);
    const list = Array.from(uniq.values());

    if (list.length !== 1) {
      skipped++;
      continue;
    }

    const member = list[0];

    // Assign XP and recompute level from XP (MEE6 curve)
    await setUserXp(guildId, member.id, Number(s.snapshot_xp));

    // Mark claimed
    await run(
      `UPDATE mee6_snapshot SET claimed_user_id=?, claimed_at=? WHERE guild_id=? AND snapshot_username=?`,
      [member.id, Date.now(), guildId, s.snapshot_username]
    );

    matched++;
  }

  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    await setClaimAllDone(guildId, true);
  }

  await message.channel.send(
    `✅ Claim-all finished.\n` +
    `• Matched & applied: **${matched}**\n` +
    `• Skipped (no/ambiguous match): **${skipped}**\n` +
    `• Already claimed rows: **${already}**\n\n` +
    `Tip: If some were skipped, rename nicknames to match snapshot usernames and run again (manager can rerun).`
  );
}

async function cmdRecalcLevels(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;
  const rows = await all(`SELECT user_id, xp FROM user_xp WHERE guild_id=?`, [guildId]);

  for (const r of rows) {
    const lvl = levelFromXp(r.xp);
    await run(`UPDATE user_xp SET level=? WHERE guild_id=? AND user_id=?`, [lvl, guildId, r.user_id]);
  }

  await message.channel.send(`✅ Recalculated levels for **${rows.length}** users using the MEE6 curve.`);
}

async function cmdHelp(message) {
  const lines = [
    `**Lop Bot Commands**`,
    `• \`!rank [@user]\` — show rank card info`,
    `• \`!leaderboard [page]\` — top XP leaderboard`,
    ``,
    `**Admin / Manager**`,
    `• \`!claim-all\` — apply MEE6 snapshot XP to matching members (one-time)`,
    `• \`!xp set @user <totalXP>\` — set XP`,
    `• \`!xp add @user <amount>\` — add XP`,
    `• \`!recalc-levels\` — recompute levels from XP (MEE6 curve)`,
    ``,
    `**Private VC (in the temp VC text channel only)**`,
    `• \`!voice-limit <num>\``,
    `• \`!voice-lock\` / \`!voice-unlock\``,
    `• \`!voice-rename "new name"\``,
    `• \`!voice-ban @user\``
  ];

  await message.channel.send(lines.join("\n"));
}

// ====== PRIVATE VC COMMANDS ======
async function ensureRoomCommandContext(message) {
  const guildId = message.guild.id;
  const room = await getRoomByTextChannel(guildId, message.channel.id);
  if (!room) return { ok: false, room: null, error: "This command can only be used in the private VC text channel." };

  // Permission: owner OR admin/mod OR manager
  const isOwner = message.author.id === room.owner_id;
  const can = isOwner || hasAdminPerms(message.member) || hasModPerms(message.member);
  if (!can) return { ok: false, room, error: "Only the room owner or staff can use this here." };

  const voiceChannel = await fetchVoiceChannel(message.guild, room.voice_channel_id);
  if (!voiceChannel) return { ok: false, room, error: "Voice channel no longer exists." };

  return { ok: true, room, voiceChannel };
}

async function cmdVoiceLimit(message, args) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const n = parseInt(args[0], 10);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    return message.reply("Usage: `!voice-limit <0-99>` (0 = no limit)");
  }

  await ctx.voiceChannel.setUserLimit(n).catch(() => null);
  await message.reply(`✅ Voice user limit set to **${n}**.`);
}

async function cmdVoiceLock(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const everyone = message.guild.roles.everyone;
  await ctx.voiceChannel.permissionOverwrites.edit(everyone, { Connect: false }).catch(() => null);
  await message.reply("🔒 VC locked (everyone can’t connect).");
}

async function cmdVoiceUnlock(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const everyone = message.guild.roles.everyone;
  await ctx.voiceChannel.permissionOverwrites.edit(everyone, { Connect: null }).catch(() => null);
  await message.reply("🔓 VC unlocked (everyone can connect).");
}

async function cmdVoiceRename(message, args) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const name = args.join(" ").trim();
  if (!name) return message.reply('Usage: `!voice-rename "new name"`');

  await ctx.voiceChannel.setName(name.slice(0, 100)).catch(() => null);
  await message.reply(`✅ VC renamed to **${name.slice(0, 100)}**.`);
}

async function cmdVoiceBan(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const target = message.mentions.members.first();
  if (!target) return message.reply("Usage: `!voice-ban @user`");

  await ctx.voiceChannel.permissionOverwrites.edit(target.id, { Connect: false }).catch(() => null);

  // If they are currently inside, boot them out
  if (target.voice?.channelId === ctx.voiceChannel.id) {
    await target.voice.disconnect().catch(() => null);
  }

  await message.reply(`⛔ Banned ${target} from connecting to this VC.`);
}

// ====== MAIN HANDLER ======
async function handleCommands(message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (cmd === "import-mee6") return await cmdImportMee6(message);

  const content = message.content || "";
  if (!content.startsWith(PREFIX)) return;

  const raw = content.slice(PREFIX.length).trim();
  if (!raw) return;

  const args = parseArgs(raw);
  const cmd = (args.shift() || "").toLowerCase();

  try {
    if (cmd === "help" || cmd === "commands") return await cmdHelp(message);

    if (cmd === "rank") return await cmdRank(message, args);
    if (cmd === "leaderboard" || cmd === "lb") return await cmdLeaderboard(message, args);

    // Admin/manager
    if (cmd === "xp") return await cmdXp(message, args);
    if (cmd === "claim-all" || cmd === "claimall") return await cmdClaimAll(message);
    if (cmd === "recalc-levels" || cmd === "recalclevels") return await cmdRecalcLevels(message);

    // Private VC commands (must be used in the temp text channel)
    if (cmd === "voice-limit") return await cmdVoiceLimit(message, args);
    if (cmd === "voice-lock") return await cmdVoiceLock(message);
    if (cmd === "voice-unlock") return await cmdVoiceUnlock(message);
    if (cmd === "voice-rename") return await cmdVoiceRename(message, args);
    if (cmd === "voice-ban") return await cmdVoiceBan(message);

    // Unknown command: ignore (or you can reply)
    return;
  } catch (e) {
    console.error("Command error:", cmd, e);
    return message.reply("❌ Something went wrong running that command.");
  }
}

module.exports = { handleCommands };