// Usage: node scripts/cubicle-message.mjs list cubicle-01
//        node scripts/cubicle-message.mjs send cubicle-01 cubicle-02 topic "message"
const [command, from, to, topic, ...words] = process.argv.slice(2);
const base = process.env.SWARM_URL || `http://127.0.0.1:${process.env.SWARM_PORT || 3820}`;
try {
  if (!['list', 'send'].includes(command) || !from) throw new Error('Use list <cubicle> or send <from> <to> <topic> <message>');
  const response = await fetch(`${base}/api/messages${command === 'list' ? '?cubicle=' + encodeURIComponent(from) : ''}`,
    command === 'send' ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, topic, text: words.join(' ') }) } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  console.log(JSON.stringify(data, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
