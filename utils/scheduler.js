const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Server = require('../models/Server');
const { signIn, buildAttendanceEmbed, getCardDetail } = require('./attendance');
const { EMBED_COLOR } = require('./constants');
const { t } = require('./i18n');

const jobs = new Map();
const dailyJobs = new Map();

const AMERICAS_EUROPE_SERVER_ID = '3';
const STAMINA_CONCURRENCY = 5;
let isCheckingStamina = false;

/**
 * 取得有設定通知頻道的伺服器查表（GuildId -> ChannelId）
 */
async function loadNotifyChannelMap() {
    const servers = await Server.findAll();
    const map = new Map();
    for (const s of servers) {
        if (s?.guildId && s?.notifyChannelId) {
            map.set(s.guildId, s.notifyChannelId);
        }
    }
    return map;
}

/**
 * 共用的伺服器頻道通知分發邏輯，支援指定單一伺服器或查表過濾共屬伺服器
 */
async function dispatchGuildNotification(user, client, buildMessage, serverChannelMap = null) {
    let discordUser = null;
    try {
        discordUser = await client.users.fetch(user.discordId);
    } catch {
        // 無法取得 Discord 使用者時，僅略過標題使用者標記
    }

    const channelMap = serverChannelMap || await loadNotifyChannelMap();
    const targetGuildIds = user.notifyGuildId
        ? [user.notifyGuildId]
        : Array.from(channelMap.keys());

    for (const guildId of targetGuildIds) {
        const notifyChannelId = channelMap.get(guildId);
        if (!notifyChannelId) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        try {
            await guild.members.fetch(user.discordId);
        } catch {
            // 使用者不在此伺服器內，略過
            continue;
        }

        try {
            let channel = guild.channels.cache.get(notifyChannelId);
            if (!channel) {
                channel = await guild.channels.fetch(notifyChannelId).catch(() => null);
            }
            if (!channel || typeof channel.send !== 'function') continue;

            const payload = buildMessage(discordUser);
            await channel.send(payload);
        } catch (err) {
            console.error(`[Scheduler] Failed sending notification to guild=${guildId} user=${user.discordId}:`, err.message);
        }
    }
}

async function runSignIn(userId, client) {
    const user = await User.findByPk(userId);
    if (!user) return;
    const lang = user.language || 'zh_Hant';

    console.warn(`[Scheduler] Running auto sign-in for ${user.discordId}`);

    if (process.env.SKIP_AUTO_SIGNIN === 'true') {
        console.warn(`[Scheduler] [Dev Mode] Skipped actual sign-in request for ${user.discordId}`);
        return;
    }

    const result = await signIn(user);

    try {
        await dispatchGuildNotification(user, client, (discordUser) => {
            const embed = buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, t(lang, 'scheduler_auto_report'), result, discordUser, lang);
            const content = (!result.success || user.isTag) ? `<@${userId}>` : '';
            return { content, embeds: [embed] };
        });
    } catch (e) {
        console.error('Failed to process server notifications:', e);
    }
}

function parseTimeParts(timeStr) {
    if (typeof timeStr !== 'string') return null;
    const match = timeStr.trim().match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return {
        hour: Number.parseInt(match[1], 10),
        minute: Number.parseInt(match[2], 10),
    };
}

function scheduleUser(user, client) {
    if (jobs.has(user.discordId)) {
        const oldJob = jobs.get(user.discordId);
        if (oldJob) oldJob.cancel();
        jobs.delete(user.discordId);
    }

    if (!user.autoSignTime) return;

    const parts = parseTimeParts(user.autoSignTime);
    if (!parts) {
        console.warn(`[Scheduler] Invalid autoSignTime "${user.autoSignTime}" for ${user.discordId}`);
        return;
    }

    const rule = new schedule.RecurrenceRule();
    rule.hour = parts.hour;
    rule.minute = parts.minute;

    const job = schedule.scheduleJob(rule, () => runSignIn(user.discordId, client));
    if (!job) {
        console.warn(`[Scheduler] Failed to create sign-in job for ${user.discordId}`);
        return;
    }
    jobs.set(user.discordId, job);
    console.warn(`[Scheduler] Scheduled job for ${user.discordId} at ${user.autoSignTime}`);
}

function cancelUser(userId) {
    if (jobs.has(userId)) {
        const job = jobs.get(userId);
        if (job) job.cancel();
        jobs.delete(userId);
        console.warn(`[Scheduler] Cancelled job for ${userId}`);
    }
}

async function checkAndSendDailyNotification(userId, client) {
    const user = await User.findByPk(userId);
    if (!user || !user.dailyNotify) return;
    if (user.dailyNotified) return;

    try {
        const result = await getCardDetail(user);
        if (!result.success) return;

        const { dailyMission } = result.detail || {};
        if (!dailyMission) return;

        const curActivation = Number.parseInt(dailyMission.dailyActivation, 10);
        const maxActivation = Number.parseInt(dailyMission.maxDailyActivation, 10);
        if (!Number.isFinite(curActivation) || !Number.isFinite(maxActivation) || maxActivation <= 0) return;

        if (curActivation >= maxActivation) return;

        await sendDailyNotification(user, curActivation, maxActivation, client);
        await user.update({ dailyNotified: true });
        console.warn(`[DailyNotify] Notified ${userId} (${curActivation}/${maxActivation})`);
    } catch (e) {
        console.error(`[DailyNotify] Error checking daily mission for ${userId}:`, e);
    }
}

async function sendDailyNotification(user, curActivation, maxActivation, client, serverChannelMap = null) {
    const lang = user.language || 'zh_Hant';
    try {
        await dispatchGuildNotification(
            user,
            client,
            () => {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'scheduler_daily_title'))
                    .setDescription(t(lang, 'scheduler_daily_desc')(curActivation, maxActivation))
                    .setTimestamp();
                const content = user.isDailyTag ? `<@${user.discordId}>` : '';
                return { content, embeds: [embed] };
            },
            serverChannelMap
        );
    } catch (e) {
        console.error(`[DailyNotify] Failed to send notification for ${user.discordId}:`, e);
    }
}

function scheduleDailyNotifyUser(user, client) {
    if (dailyJobs.has(user.discordId)) {
        const oldJob = dailyJobs.get(user.discordId);
        if (oldJob) oldJob.cancel();
        dailyJobs.delete(user.discordId);
    }

    if (!user.dailyNotify || !user.dailyNotifyTime) return;

    const parts = parseTimeParts(user.dailyNotifyTime);
    if (!parts) {
        console.warn(`[DailyNotify] Invalid dailyNotifyTime "${user.dailyNotifyTime}" for ${user.discordId}`);
        return;
    }

    const rule = new schedule.RecurrenceRule();
    rule.hour = parts.hour;
    rule.minute = parts.minute;
    rule.tz = 'UTC';

    const job = schedule.scheduleJob(rule, () => checkAndSendDailyNotification(user.discordId, client));
    if (!job) {
        console.warn(`[DailyNotify] Failed to create notify job for ${user.discordId}`);
        return;
    }
    dailyJobs.set(user.discordId, job);
    console.warn(`[DailyNotify] Scheduled notify job for ${user.discordId} at ${user.dailyNotifyTime} UTC`);
}

function cancelDailyNotifyUser(userId) {
    if (dailyJobs.has(userId)) {
        const job = dailyJobs.get(userId);
        if (job) job.cancel();
        dailyJobs.delete(userId);
        console.warn(`[DailyNotify] Cancelled notify job for ${userId}`);
    }
}

async function resetDailyNotified(serverId) {
    try {
        await User.update(
            { dailyNotified: false },
            { where: { dailyNotify: true, serverId, dailyNotified: true } }
        );
        console.warn(`[DailyNotify] Reset dailyNotified for server ${serverId}`);
    } catch (e) {
        console.error(`[DailyNotify] Error resetting dailyNotified for server ${serverId}:`, e);
    }
}

async function initScheduler(client) {
    const users = await User.findAll();
    for (const user of users) {
        if (user.autoSignTime) {
            scheduleUser(user, client);
        }
        if (user.dailyNotify && user.dailyNotifyTime) {
            scheduleDailyNotifyUser(user, client);
        }
    }
    console.warn(`[Scheduler] Initialized ${jobs.size} sign-in jobs and ${dailyJobs.size} daily notify jobs.`);

    const staminaRule = new schedule.RecurrenceRule();
    staminaRule.minute = [0, 30];
    schedule.scheduleJob(staminaRule, () => checkStamina(client));
    console.warn('[Scheduler] Stamina check scheduled every 30 minutes.');

    const cnAsiaResetRule = new schedule.RecurrenceRule();
    cnAsiaResetRule.hour = 20;
    cnAsiaResetRule.minute = 0;
    cnAsiaResetRule.tz = 'UTC';
    schedule.scheduleJob(cnAsiaResetRule, () => {
        resetDailyNotified('1');
        resetDailyNotified('2');
        resetDailyNotified('57');
    });
    console.warn('[DailyNotify] China/Asia daily reset job scheduled at 20:00 UTC.');

    const ameResetRule = new schedule.RecurrenceRule();
    ameResetRule.hour = 9;
    ameResetRule.minute = 0;
    ameResetRule.tz = 'UTC';
    schedule.scheduleJob(ameResetRule, () => resetDailyNotified(AMERICAS_EUROPE_SERVER_ID));
    console.warn('[DailyNotify] Americas/Europe daily reset job scheduled at 09:00 UTC.');
}

async function sendStaminaNotification(user, curStamina, maxStamina, client, serverChannelMap = null) {
    const lang = user.language || 'zh_Hant';
    try {
        await dispatchGuildNotification(
            user,
            client,
            () => {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'scheduler_stamina_title'))
                    .setDescription(t(lang, 'scheduler_stamina_desc')(curStamina, maxStamina))
                    .setTimestamp();
                const content = user.isStaminaTag ? `<@${user.discordId}>` : '';
                return { content, embeds: [embed] };
            },
            serverChannelMap
        );
    } catch (e) {
        console.error(`[Stamina] Failed to send notification for ${user.discordId}:`, e);
    }
}

async function checkStamina(client) {
    if (isCheckingStamina) {
        console.warn('[Stamina] Previous stamina check is still running; skipping overlapping run.');
        return;
    }

    isCheckingStamina = true;
    try {
        const users = await User.findAll({ where: { staminaNotify: true } });
        if (!users || users.length === 0) return;

        const serverChannelMap = await loadNotifyChannelMap();
        let cursor = 0;
        const workerCount = Math.min(STAMINA_CONCURRENCY, users.length);

        const workers = Array.from({ length: workerCount }, async () => {
            while (cursor < users.length) {
                const user = users[cursor++];
                try {
                    const result = await getCardDetail(user);
                    if (!result.success) continue;

                    const dungeon = result.detail?.dungeon;
                    if (!dungeon) continue;

                    const curStamina = Number.parseInt(dungeon.curStamina, 10);
                    const maxStamina = Number.parseInt(dungeon.maxStamina, 10);
                    if (!Number.isFinite(curStamina) || !Number.isFinite(maxStamina) || maxStamina <= 0) continue;

                    const threshold = user.staminaThreshold ?? 80;
                    const isNearFull = curStamina >= Math.ceil((maxStamina * threshold) / 100);

                    if (isNearFull && !user.staminaNotified) {
                        await sendStaminaNotification(user, curStamina, maxStamina, client, serverChannelMap);
                        await user.update({ staminaNotified: true });
                        console.warn(`[Stamina] Notified ${user.discordId} (${curStamina}/${maxStamina})`);
                    } else if (!isNearFull && user.staminaNotified) {
                        await user.update({ staminaNotified: false });
                    }
                } catch (e) {
                    console.error(`[Stamina] Error checking stamina for ${user.discordId}:`, e);
                }
            }
        });

        await Promise.all(workers);
    } finally {
        isCheckingStamina = false;
    }
}

module.exports = {
    initScheduler,
    scheduleUser,
    cancelUser,
    scheduleDailyNotifyUser,
    cancelDailyNotifyUser,
    checkStamina,
};
