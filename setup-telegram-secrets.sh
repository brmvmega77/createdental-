#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
umask 077
mkdir -p .data

write_secret() {
  local target="$1"
  local label="$2"
  local value=''
  read -r -s -p "$label: " value
  printf '\n'
  if [[ -z "$value" ]]; then
    printf 'Значение не введено. Настройка остановлена.\n' >&2
    exit 1
  fi
  printf '%s' "$value" > "$target"
  unset value
}

printf 'Значения при вводе не отображаются на экране.\n\n'
write_secret .data/telegram-bot-token 'Токен Telegram-бота'
write_secret .data/yandex-speechkit-api-key 'API-ключ SpeechKit'
write_secret .data/yandex-gpt-api-key 'API-ключ YandexGPT'
write_secret .data/yandex-folder-id 'ID каталога Yandex Cloud'

chmod 700 .data
chmod 600 .data/telegram-bot-token .data/yandex-speechkit-api-key .data/yandex-gpt-api-key .data/yandex-folder-id

if [[ "$(id -u)" == '0' ]]; then
  chown -R 1000:1000 .data
elif command -v sudo >/dev/null 2>&1; then
  sudo chown -R 1000:1000 .data
else
  printf 'Нужны права администратора, чтобы передать закрытые файлы контейнеру.\n' >&2
  exit 1
fi

printf '\nСекреты сохранены. Пересобираю и запускаю Create Dental…\n'
docker compose up -d --build
printf '\nПоследние сообщения сервера:\n'
docker logs --tail 50 create-dental
printf '\nЕсли выше есть строка "Telegram bridge enabled", отправьте /connect в клиентском чате.\n'
