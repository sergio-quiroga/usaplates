#!/usr/bin/env bash
# Actualiza la app desde GitHub y reinicia el servicio, respaldando antes la
# base de datos. Corre en el servidor (podman rootless + Quadlet), dentro
# del clon:
#
#   ./scripts/update.sh            # solo si hay commits nuevos
#   ./scripts/update.sh --force    # reconstruye y reinicia aunque no los haya
#
# Pasos: git pull (solo fast-forward) -> build de la imagen nueva (la app
# sigue corriendo) -> stop -> respaldo de data/ verificado -> start ->
# verificar HTTP, integridad y conteos de la BD.
# Respaldos en ~/usaplates-backups/<fecha>/ (se conservan los últimos 10).
set -euo pipefail

IMAGE="localhost/usaplates:latest"
PREVIOUS="localhost/usaplates:previous"
SERVICE="usaplates.service"
QUADLET_DIR="$HOME/.config/containers/systemd"

main() {
    local force=0 app_dir backups ts bk old new before after
    [ "${1:-}" = "--force" ] && force=1
    app_dir="$(cd "$(dirname "$0")/.." && pwd)"
    backups="$HOME/usaplates-backups"
    cd "$app_dir"

    [ -f data/db.sqlite3 ] || die "no existe $app_dir/data/db.sqlite3"
    [ -f .env ] || die "no existe $app_dir/.env"
    git -c core.fileMode=false diff --quiet && git diff --cached --quiet \
        || die "hay cambios locales en archivos versionados (ver 'git status'); resuélvelos antes de actualizar"

    say "Buscando cambios en GitHub"
    git fetch origin
    old="$(git rev-parse HEAD)"
    new="$(git rev-parse '@{u}')"
    if [ "$old" = "$new" ] && [ "$force" -eq 0 ]; then
        echo "Ya está en la última versión ($(git log -1 --format='%h %s'))."
        echo "Usa --force para reconstruir y reiniciar de todas formas."
        exit 0
    fi
    git log --oneline "$old..$new"
    git merge --ff-only '@{u}'

    say "Construyendo imagen nueva (la app sigue corriendo)"
    podman image exists "$IMAGE" && podman tag "$IMAGE" "$PREVIOUS"
    if ! podman build -t "$IMAGE" .; then
        git reset --hard "$old"
        die "falló el build; el código volvió a la versión anterior y la app sigue corriendo"
    fi

    say "Deteniendo la app y respaldando la base de datos"
    before="$(db_counts data/db.sqlite3)"
    systemctl --user stop "$SERVICE"
    ts="$(date +%Y%m%d-%H%M%S)"
    bk="$backups/$ts"
    mkdir -p "$bk"
    # podman unshare: los archivos de data/ pertenecen al usuario del contenedor
    podman unshare cp -a data "$bk/data"
    podman unshare cmp data/db.sqlite3 "$bk/data/db.sqlite3"
    [ "$(db_integrity "$bk/data/db.sqlite3")" = "ok" ] \
        || die "el respaldo no pasó integrity_check (la app quedó detenida: systemctl --user start $SERVICE)"
    echo "$old" > "$bk/previous-commit"
    echo "Respaldo OK: $bk"

    say "Levantando la versión nueva"
    if ! cmp -s deploy/usaplates.container "$QUADLET_DIR/usaplates.container"; then
        mkdir -p "$QUADLET_DIR"
        cp deploy/usaplates.container "$QUADLET_DIR/usaplates.container"
        systemctl --user daemon-reload
        echo "Quadlet actualizado"
    fi
    systemctl --user start "$SERVICE"

    say "Verificando"
    for _ in $(seq 1 30); do
        http_ok && break
        sleep 2
    done
    http_ok || die "la app no responde en :8000 (journalctl --user -u $SERVICE -n 50)"
    echo "HTTP: ok"
    [ "$(db_integrity data/db.sqlite3)" = "ok" ] || die "integrity_check falló en la BD activa"
    after="$(db_counts data/db.sqlite3)"
    echo "Estados/patentes antes: $before | después: $after"
    [ "$before" = "$after" ] || die "los conteos cambiaron; respaldo en $bk"

    # Conservar solo los 10 respaldos más recientes; borrar imágenes huérfanas
    ls -1d "$backups"/*/ 2>/dev/null | sort | head -n -10 | xargs -r podman unshare rm -rf
    podman image prune -f >/dev/null

    say "Listo: $(git log -1 --format='%h %s')"
    cat <<EOF
Para revertir:
  systemctl --user stop $SERVICE
  cd $app_dir
  podman unshare mv data data.failed-$ts
  podman unshare cp -a $bk/data data
  git reset --hard $old
  podman tag $PREVIOUS $IMAGE
  systemctl --user start $SERVICE
EOF
}

db_counts() {
    podman unshare python3 -c '
import sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
print(" ".join(str(db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
               for t in ("plates_state", "plates_sighting")))
' "$1"
}

db_integrity() {
    podman unshare python3 -c '
import sqlite3, sys
print(sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True).execute("PRAGMA integrity_check").fetchone()[0])
' "$1"
}

http_ok() {
    python3 -c 'import urllib.request; urllib.request.urlopen("http://localhost:8000/api/states/", timeout=5)' 2>/dev/null
}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORTADO: %s\033[0m\n' "$*" >&2; exit 1; }

# Todo va dentro de main() para que bash lea el script completo antes de
# ejecutarlo: git merge puede reemplazar este mismo archivo a mitad de camino.
main "$@"
