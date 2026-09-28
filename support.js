const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let token = sessionStorage.getItem('create-dental-support-token') || '';
let selected = '';
let lastMessages = '';

async function request(url, options={}) {
  const response = await fetch(url, {...options, headers:{'Content-Type':'application/json','X-Support-Token':token,...options.headers}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка связи');
  return data;
}

async function refresh() {
  if (!token) return;
  try {
    const {conversations} = await request('/api/support/conversations');
    $('#login').hidden = true;
    $('#workspace').hidden = false;
    $('#threads').innerHTML = conversations.length ? conversations.map(chat => `<button class="thread ${selected===chat.id?'active':''}" data-conversation="${chat.id}"><strong>Клиент · ${chat.id.slice(0,8)}</strong><small>${escapeHtml(chat.lastMessage)}</small></button>`).join('') : '<p class="empty" style="padding:20px">Диалогов пока нет</p>';
    if (selected) {
      const {messages} = await request('/api/support/messages?conversation=' + selected);
      const signature = JSON.stringify(messages);
      if (signature !== lastMessages) {
        lastMessages = signature;
        $('#messages').innerHTML = messages.map(message => `<div class="message ${message.from==='support'?'support':''}">${escapeHtml(message.text)}<time>${new Date(message.time).toLocaleString('ru-RU')}</time></div>`).join('');
        $('#messages').scrollTop = $('#messages').scrollHeight;
      }
    }
  } catch (error) {
    if (error.message.includes('ключ') || error.message.includes('настроена')) {
      $('#workspace').hidden = true;
      $('#login').hidden = false;
      $('#login-error').textContent = error.message;
      token = '';
      sessionStorage.removeItem('create-dental-support-token');
    } else {
      $('#chat-title').textContent = error.message;
    }
  }
}

$('#login-button').addEventListener('click', async () => {
  token = $('#token').value.trim();
  if (!token) return;
  sessionStorage.setItem('create-dental-support-token', token);
  await refresh();
});
$('#token').addEventListener('keydown', event => { if (event.key === 'Enter') $('#login-button').click(); });
$('#threads').addEventListener('click', event => {
  const button = event.target.closest('[data-conversation]');
  if (!button) return;
  selected = button.dataset.conversation;
  lastMessages = '';
  $('#chat-title').textContent = 'Диалог · ' + selected.slice(0,8);
  $('#reply').disabled = false;
  $('#reply-form button').disabled = false;
  refresh();
});
$('#reply-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('#reply').value.trim();
  if (!selected || !text) return;
  try {
    await request('/api/support/reply', {method:'POST',body:JSON.stringify({conversation:selected,text})});
    $('#reply').value = '';
    await refresh();
  } catch (error) { $('#chat-title').textContent = error.message; }
});
if (token) refresh();
setInterval(refresh, 3000);
