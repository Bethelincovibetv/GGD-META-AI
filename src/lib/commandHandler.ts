/**
 * Command Handler and Message Parser for GGD META AI WhatsApp Bot
 * 
 * Uses '.' as the primary command prefix (.tagall, .silenttag, .help, .broadcast, etc.)
 * Provides Silent Tagging, Admin RBAC, and Bot Name Management.
 */

import { WASocket, proto } from '@whiskeysockets/baileys';
import { adminManager } from './adminManager.ts';
import { broadcastQueue } from './broadcastQueue.ts';

export interface CommandContext {
  sock: WASocket;
  msg: proto.IWebMessageInfo;
  remoteJid: string;
  senderJid: string;
  isGroup: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  command: string;
  args: string[];
  fullArgString: string;
  botName?: string;
  onUpdateBotName?: (newName: string) => Promise<void>;
}

export class CommandHandler {
  // '.' is primary command prefix, while keeping compatibility with '!' and '/'
  private commandPrefixes = ['.', '!', '/'];

  /**
   * Parses text to determine if it is a command
   */
  public parseCommand(text: string): { isCommand: boolean; command: string; args: string[]; fullArgString: string; prefix: string } | null {
    if (!text || text.trim().length === 0) return null;

    const trimmed = text.trim();
    const firstChar = trimmed[0];

    if (!this.commandPrefixes.includes(firstChar)) {
      return null;
    }

    const withoutPrefix = trimmed.slice(1).trim();
    const parts = withoutPrefix.split(/\s+/);
    const command = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);
    const fullArgString = withoutPrefix.slice(command.length).trim();

    return {
      isCommand: true,
      command,
      args,
      fullArgString,
      prefix: firstChar,
    };
  }

  /**
   * Executes a parsed command
   */
  public async handleCommand(ctx: CommandContext): Promise<boolean> {
    const { sock, remoteJid, command, args, fullArgString, isGroup, isAdmin, isOwner, senderJid, msg } = ctx;
    const botName = ctx.botName || 'GGD META AI';

    console.log(`[CommandHandler] Processing command '.${command}' from ${senderJid} (isAdmin: ${isAdmin}, isOwner: ${isOwner})`);

    switch (command) {
      // 1. HELP & MENU COMMAND
      case 'help':
      case 'menu':
      case 'commands': {
        const helpText = 
`⚡ *${botName.toUpperCase()} COMMAND CENTER* ⚡

Available Commands (Prefix: *.*):
• *.help* - Display this command menu & guidelines
• *.tagall [notice]* - Tag all group members with announcement
• *.silenttag [notice]* - Silent tagging (Notifies all members without visible phone wall)
• *.broadcast <groupJid> <msg>* - Enqueue a high-priority broadcast
• *.admins* - View registered administrators from PostgreSQL
• *.addadmin <number> [name]* - Grant admin rights (Superadmin)
• *.deladmin <number>* - Revoke admin rights (Superadmin)
• *.setbotname <newName>* - Rename bot dynamically (Superadmin)
• *.status* - View Cloud SQL persistence, BullMQ queue & uptime
• *.ping* - Test socket response latency

👑 *Your Access Level:* ${isOwner ? 'Primary Owner' : isAdmin ? 'Authorized Administrator' : 'Group Member'}
🤖 *Engine:* ${botName} • Cloud SQL PostgreSQL`;

        await sock.sendMessage(remoteJid, { text: helpText }, { quoted: msg as any });
        return true;
      }

      // 2. TAG ALL COMMAND (Standard announcement tag)
      case 'tagall':
      case 'everyone':
      case 'all': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '⚠️ *.tagall* can only be executed inside a WhatsApp group.' }, { quoted: msg as any });
          return true;
        }

        if (!isAdmin && !isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only administrators can execute the *.tagall* command.' },
            { quoted: msg as any }
          );
          return true;
        }

        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          const participants = groupMeta.participants.map((p) => p.id);

          if (!participants || participants.length === 0) {
            await sock.sendMessage(remoteJid, { text: '⚠️ No participants found in this group.' }, { quoted: msg as any });
            return true;
          }

          const customNotice = fullArgString ? `\n\n💬 *Notice:*\n"${fullArgString}"` : '';
          const mentionsTags = participants.map((jid) => `@${jid.split('@')[0]}`).join(' ');

          const replyText = 
`🏷️ *ATTENTION EVERYONE* 🏷️
📍 *Group:* ${groupMeta.subject}
👥 *Members Notified (${participants.length}):*${customNotice}

${mentionsTags}

⚡ _Triggered via .tagall by @${senderJid.split('@')[0]}_ [${botName}] [AUTO_TAG_BOT]`;

          await sock.sendMessage(
            remoteJid,
            {
              text: replyText,
              mentions: [...participants, senderJid],
            },
            { quoted: msg as any }
          );
          return true;
        } catch (err: any) {
          await sock.sendMessage(
            remoteJid,
            { text: `❌ Failed to execute .tagall: ${err.message}` },
            { quoted: msg as any }
          );
          return true;
        }
      }

      // 3. SILENT TAGGING SYSTEM (.silenttag / .stag / .hidetag)
      case 'silenttag':
      case 'stag':
      case 'hidetag': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '⚠️ *.silenttag* can only be executed inside a WhatsApp group.' }, { quoted: msg as any });
          return true;
        }

        if (!isAdmin && !isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only administrators can trigger *.silenttag*.' },
            { quoted: msg as any }
          );
          return true;
        }

        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          const participants = groupMeta.participants.map((p) => p.id);

          if (!participants || participants.length === 0) {
            await sock.sendMessage(remoteJid, { text: '⚠️ No participants found in this group.' }, { quoted: msg as any });
            return true;
          }

          const customNotice = fullArgString ? `\n\n💬 *Announcement:*\n"${fullArgString}"` : '';

          // Silent tag message: Mention array notifies all devices, but message remains clean with no wall of phone numbers!
          const replyText = 
`🔔 *SILENT GROUP NOTIFICATION* 🔔
📍 *Group:* ${groupMeta.subject}${customNotice}

_All ${participants.length} group members have been notified silently without chat clutter._ \u200B\u200e
⚡ _Powered by ${botName}_ [AUTO_TAG_BOT]`;

          await sock.sendMessage(
            remoteJid,
            {
              text: replyText,
              mentions: participants,
            },
            { quoted: msg as any }
          );
          return true;
        } catch (err: any) {
          await sock.sendMessage(
            remoteJid,
            { text: `❌ Failed to execute .silenttag: ${err.message}` },
            { quoted: msg as any }
          );
          return true;
        }
      }

      // 4. BROADCAST COMMAND
      case 'broadcast': {
        if (!isAdmin && !isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only administrators can queue broadcasts.' },
            { quoted: msg as any }
          );
          return true;
        }

        if (args.length < 2) {
          await sock.sendMessage(
            remoteJid,
            { text: '⚠️ Usage: *.broadcast <groupJid> <message text>*\nExample: `.broadcast 120363024890123456@g.us Emergency meeting now`' },
            { quoted: msg as any }
          );
          return true;
        }

        const targetGroupJid = args[0];
        const broadcastMsg = args.slice(1).join(' ');

        if (!targetGroupJid.endsWith('@g.us')) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ Invalid group JID. Must end with `@g.us`.' },
            { quoted: msg as any }
          );
          return true;
        }

        // Add to Message Queue
        const { jobId, mode } = await broadcastQueue.addBroadcastJob({
          groupJid: targetGroupJid,
          message: broadcastMsg,
          senderJid,
        });

        await sock.sendMessage(
          remoteJid,
          {
            text: `✅ *Broadcast Queued!*
🆔 *Job ID:* \`${jobId}\`
🎯 *Target:* \`${targetGroupJid}\`
⚙️ *Queue Engine:* \`${mode}\`
🤖 *Bot:* ${botName}

The worker is actively processing this job in the background with auto-retries.`,
          },
          { quoted: msg as any }
        );
        return true;
      }

      // 5. LIST ADMINS
      case 'admins':
      case 'adminlist': {
        const admins = await adminManager.getAdmins();
        let listText = `🛡️ *${botName.toUpperCase()} ADMINISTRATORS (${admins.length})* 🛡️\n\n`;

        admins.forEach((admin, i) => {
          listText += `${i + 1}. *${admin.name}*\n   • JID: \`${admin.jid}\`\n   • Role: *${admin.role}*\n   • Permissions: ${admin.can_broadcast ? '📢 Broadcast ' : ''}${admin.can_tagall ? '🏷️ TagAll ' : ''}\n\n`;
        });

        listText += `_Admins have privileged access to .tagall, .silenttag, and .broadcast._`;
        await sock.sendMessage(remoteJid, { text: listText }, { quoted: msg as any });
        return true;
      }

      // 6. ADD ADMIN (Superadmin only)
      case 'addadmin': {
        const callerAdmin = await adminManager.getAdmin(senderJid);
        const isSuper = isOwner || callerAdmin?.role === 'superadmin';

        if (!isSuper) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only Superadministrators can add new administrators.' },
            { quoted: msg as any }
          );
          return true;
        }

        if (args.length < 1) {
          await sock.sendMessage(
            remoteJid,
            { text: '⚠️ Usage: *.addadmin <phoneNumber> [DisplayName]*\nExample: `.addadmin 14155552671 Sarah Ops`' },
            { quoted: msg as any }
          );
          return true;
        }

        const phone = args[0];
        const name = args.slice(1).join(' ') || `Admin (+${phone.replace(/[^0-9]/g, '')})`;
        const newAdmin = await adminManager.addAdmin({
          jid: phone,
          name,
          role: 'admin',
          addedBy: senderJid,
          canBroadcast: true,
          canTagall: true,
        });

        await sock.sendMessage(
          remoteJid,
          {
            text: `✅ *Administrator Added Successfully!*
👤 *Name:* ${newAdmin.name}
📱 *JID:* \`${newAdmin.jid}\`
🛡️ *Role:* ${newAdmin.role}
💾 Saved to PostgreSQL database \`bot_admins\`.`,
          },
          { quoted: msg as any }
        );
        return true;
      }

      // 7. DELETE ADMIN (Superadmin only)
      case 'deladmin':
      case 'removeadmin': {
        const callerAdmin = await adminManager.getAdmin(senderJid);
        const isSuper = isOwner || callerAdmin?.role === 'superadmin';

        if (!isSuper) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only Superadministrators can remove administrators.' },
            { quoted: msg as any }
          );
          return true;
        }

        if (args.length < 1) {
          await sock.sendMessage(
            remoteJid,
            { text: '⚠️ Usage: *.deladmin <phoneNumber or JID>*' },
            { quoted: msg as any }
          );
          return true;
        }

        const target = args[0];
        const removed = await adminManager.removeAdmin(target);

        if (removed) {
          await sock.sendMessage(
            remoteJid,
            { text: `✅ Administrator \`${target}\` has been removed from PostgreSQL records.` },
            { quoted: msg as any }
          );
        } else {
          await sock.sendMessage(
            remoteJid,
            { text: `⚠️ Administrator \`${target}\` was not found in the admin list.` },
            { quoted: msg as any }
          );
        }
        return true;
      }

      // 8. MANAGE BOT NAME (.setbotname <newName>)
      case 'setbotname':
      case 'botname': {
        const callerAdmin = await adminManager.getAdmin(senderJid);
        const isSuper = isOwner || callerAdmin?.role === 'superadmin';

        if (!isSuper) {
          await sock.sendMessage(
            remoteJid,
            { text: '❌ *Access Denied:* Only Superadministrators can manage the bot name.' },
            { quoted: msg as any }
          );
          return true;
        }

        if (!fullArgString || fullArgString.trim().length === 0) {
          await sock.sendMessage(
            remoteJid,
            { text: `🤖 *Current Bot Name:* ${botName}\n\nTo update, use: *.setbotname <New Name>*\nExample: \`.setbotname GGD META AI Pro\`` },
            { quoted: msg as any }
          );
          return true;
        }

        const newName = fullArgString.trim().slice(0, 50);
        if (ctx.onUpdateBotName) {
          await ctx.onUpdateBotName(newName);
        }

        await sock.sendMessage(
          remoteJid,
          {
            text: `✅ *Bot Name Successfully Updated!*
🏷️ *New Name:* *${newName}*
💾 Saved to PostgreSQL configuration and Cloud SQL storage.`,
          },
          { quoted: msg as any }
        );
        return true;
      }

      // 9. STATUS & METRICS
      case 'status': {
        const queueStats = broadcastQueue.getStats();
        const statusText = 
`⚡ *${botName.toUpperCase()} STATUS & HEALTH* ⚡

🤖 *Bot Name:* ${botName}
📡 *Connection:* Active & Synced (Baileys)
📬 *Queue Engine:* ${queueStats.mode}
📊 *Queue Length:* ${queueStats.queueLength} waiting
✅ *Completed Jobs:* ${queueStats.counts.completed}
❌ *Failed Jobs:* ${queueStats.counts.failed}
🛡️ *Database Storage:* PostgreSQL (Google Cloud SQL)
⏱️ *Timestamp:* ${new Date().toLocaleTimeString()}`;

        await sock.sendMessage(remoteJid, { text: statusText }, { quoted: msg as any });
        return true;
      }

      // 10. PING
      case 'ping': {
        const start = Date.now();
        await sock.sendMessage(remoteJid, { text: `🏓 Pong! ⚡ Latency: ${Date.now() - start}ms • ${botName}` }, { quoted: msg as any });
        return true;
      }

      default:
        // Unknown command
        if (!isGroup) {
          await sock.sendMessage(
            remoteJid,
            { text: `⚠️ Unknown command \`.${command}\`. Type *.help* to view available commands.` },
            { quoted: msg as any }
          );
        }
        return false;
    }
  }
}

export const commandHandler = new CommandHandler();
