import { createClient } from '@vercel/kv';

function getKv() {
  return createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

const DEFAULT_USERS = [
  { username: 'demo', password: '123456', maxDownloads: 5, isAdmin: false },
  { username: 'admin', password: 'admin888', maxDownloads: 999, isAdmin: true },
  { username: 'test', password: 'test123', maxDownloads: 3, isAdmin: false },
  { username: 'vip', password: 'vip2026', maxDownloads: 10, isAdmin: false },
];

async function seedUsers(kv) {
  for (const u of DEFAULT_USERS) {
    const exists = await kv.hexists(`user:${u.username}`, 'password');
    if (!exists) {
      await kv.hset(`user:${u.username}`, {
        password: u.password,
        maxDownloads: u.maxDownloads,
        isAdmin: u.isAdmin ? 'true' : 'false',
        remaining: u.maxDownloads,
        deviceId: '',
        failedAttempts: '0',
        lockedUntil: '0',
      });
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: '仅支持 POST' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kv = getKv();

  try {
    await seedUsers(kv);
    const { username, password, deviceId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }

    const userData = await kv.hgetall(`user:${username}`);
    if (!userData) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const lockedUntil = parseInt(userData.lockedUntil || '0');
    if (lockedUntil > Date.now()) {
      const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
      return res.status(429).json({ success: false, message: `账户已锁定，请 ${wait} 秒后再试` });
    }

    if (userData.password !== password) {
      const failed = parseInt(userData.failedAttempts || '0') + 1;
      if (failed >= 5) {
        await kv.hset(`user:${username}`, { failedAttempts: '0', lockedUntil: (Date.now() + 300000).toString() });
        return res.status(429).json({ success: false, message: '错误过多，锁定 5 分钟' });
      }
      await kv.hset(`user:${username}`, { failedAttempts: failed.toString() });
      return res.status(401).json({ success: false, message: `密码错误（还剩 ${5 - failed} 次）` });
    }

    await kv.hset(`user:${username}`, { failedAttempts: '0', lockedUntil: '0' });

    const boundDevice = userData.deviceId || '';
    const isAdmin = userData.isAdmin === 'true';

    if (boundDevice && boundDevice !== deviceId && !isAdmin) {
      return res.status(403).json({ success: false, message: '此账户已被其他设备绑定！' });
    }

    if (!boundDevice && !isAdmin) {
      await kv.hset(`user:${username}`, { deviceId });
    }

    let remaining = parseInt(userData.remaining || '0');
    if (!isAdmin && remaining <= 0) {
      return res.status(403).json({ success: false, message: '下载次数已用完' });
    }

    if (!isAdmin) {
      remaining -= 1;
      await kv.hset(`user:${username}`, { remaining: remaining.toString() });
    }

    return res.status(200).json({
      success: true,
      message: '✅ 验证成功',
      downloadUrl: 'https://wwasy.lanzouu.com/i31s03okx2ib',
      remaining: remaining,
      isAdmin: isAdmin,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
                             }
