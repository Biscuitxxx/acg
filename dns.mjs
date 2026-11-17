/**
 * 局域网小 DNS —— 把 acg.lan 解析到自己这台机器，其他域名照常转发
 *
 * 用途：让手机 / 平板 / 别的电脑输入 acg.lan:8787，而不是记 192.168.5.134:8787
 *
 * 跑起来（Windows 上普通用户就能绑定 53，不需要管理员）：
 *   node dns.mjs
 *
 * 想改配置就用环境变量：
 *   DNS_TARGET=192.168.5.134      acg.lan 指向哪台机器
 *   DNS_ZONE=acg.lan,acg         要拦截的名字（逗号分隔，可以多个）
 *   DNS_UPSTREAM=202.96.128.86   其他域名转发给谁（默认本机在用的电信 DNS）
 *   DNS_PORT=53                 监听端口
 *
 * 注意：一旦把手机的 DNS 指向这台机器，这台机器必须一直开着，
 *      否则手机连任何网站都打不开。不想承担这个风险就别用。
 */
import { createSocket } from "node:dgram";

const PORT = Number(process.env.DNS_PORT || 53);
const HOST = process.env.DNS_HOST || "0.0.0.0";
const TARGET_IP = process.env.DNS_TARGET || "192.168.5.134";
const ZONE = (process.env.DNS_ZONE || "acg.lan")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const UPSTREAM_HOST = process.env.DNS_UPSTREAM || "202.96.128.86";
const UPSTREAM_PORT = Number(process.env.DNS_UPSTREAM_PORT || 53);
const TTL = Number(process.env.DNS_TTL || 60);

const TARGET_BYTES = TARGET_IP.split(".").map((n) => Number(n));
if (TARGET_BYTES.length !== 4 || TARGET_BYTES.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
  console.error(`[dns] DNS_TARGET 不是合法 IPv4：${TARGET_IP}`);
  process.exit(1);
}

/** 从 offset 处读出一个域名（客户端发来的查询不带压缩指针，简化处理） */
function readName(buf, offset) {
  const labels = [];
  let pos = offset;
  while (pos < buf.length && buf[pos] !== 0) {
    const len = buf[pos];
    if (len > 63 || pos + 1 + len > buf.length) return { name: "", next: -1 };
    labels.push(buf.toString("ascii", pos + 1, pos + 1 + len));
    pos += len + 1;
  }
  if (pos >= buf.length) return { name: "", next: -1 };
  return { name: labels.join(".").toLowerCase(), next: pos + 1 };
}

/** 构造 A 记录应答；非 A 查询返回不含 answer 的空应答，让客户端自己回退 */
function buildResponse(query) {
  const q = readName(query, 12);
  if (q.next < 0 || q.next + 4 > query.length) return null;
  const qtype = query.readUInt16BE(q.next);
  const qclass = query.readUInt16BE(q.next + 2);
  const questionEnd = q.next + 4;

  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2); // 原样回传 ID
  header.writeUInt16BE(0x8180, 2); // QR=1, RD=1, RA=1, RCODE=0
  header.writeUInt16BE(1, 4); // QDCOUNT
  const hasAnswer = qtype === 1; // 只对 A 记录给答案
  header.writeUInt16BE(hasAnswer ? 1 : 0, 6); // ANCOUNT
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const question = query.subarray(12, questionEnd);
  if (!hasAnswer) return { packet: Buffer.concat([header, question]), name: q.name, qtype };

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0); // NAME 用压缩指针指回偏移 12
  answer.writeUInt16BE(1, 2); // TYPE A
  answer.writeUInt16BE(qclass, 4); // CLASS
  answer.writeUInt32BE(TTL, 6); // TTL
  answer.writeUInt16BE(4, 10); // RDLENGTH
  Buffer.from(TARGET_BYTES).copy(answer, 12); // RDATA

  return { packet: Buffer.concat([header, question, answer]), name: q.name, qtype };
}

const sock = createSocket("udp4");

sock.on("error", (err) => {
  console.error(`[dns] socket 异常 ${err.code || ""} ${err.message}`);
  if (err.code === "EADDRINUSE") {
    console.error("[dns] 53 端口被别的程序占了（VPN、Clash、虚拟机网络之类），先把它关掉");
    process.exit(1);
  }
});

sock.on("message", (msg, rinfo) => {
  if (msg.length < 16) return;
  let q;
  try {
    q = readName(msg, 12);
  } catch {
    return;
  }
  if (!q.name) return;

  if (ZONE.includes(q.name)) {
    const built = buildResponse(msg);
    if (built) {
      sock.send(built.packet, rinfo.port, rinfo.address);
      const t = built.qtype === 1 ? "A" : `type${built.qtype}`;
      console.log(`[dns] ${q.name} (${t}) -> ${built.qtype === 1 ? TARGET_IP : "空应答"}  来自 ${rinfo.address}`);
    }
    return;
  }

  // 其他域名：原样转发给上游，收到响应再回给客户端
  const upstream = createSocket("udp4");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try {
      upstream.close();
    } catch {
      /* 已关闭 */
    }
  };
  const timer = setTimeout(finish, 4000);

  upstream.on("message", (resp) => {
    try {
      sock.send(resp, rinfo.port, rinfo.address);
    } catch {
      /* 客户端已关 */
    }
    finish();
  });
  upstream.on("error", finish);
  try {
    upstream.send(msg, UPSTREAM_PORT, UPSTREAM_HOST, (err) => {
      if (err) finish();
    });
  } catch {
    finish();
  }
});

sock.bind(PORT, HOST, () => {
  console.log(`[dns] 局域网 DNS 已启动  ${HOST}:${PORT}`);
  console.log(`[dns] 拦截 ${ZONE.join(" / ")}  ->  ${TARGET_IP}`);
  console.log(`[dns] 其余域名转发给 ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  console.log(`[dns] 其他设备把 DNS 改成本机 IP 就能用（Windows 上绑 53 不需要管理员）`);
  console.log(`[dns] 提醒：本机一关，指向它的设备就上不了网`);
});
