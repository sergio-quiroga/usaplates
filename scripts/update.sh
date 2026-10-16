#!/usr/bin/env bash
# Actualiza la app desde GitHub y reinicia el contenedor, respaldando antes
# la base de datos. Pensado para correr en el servidor, dentro del clon:
#
#   ./scripts/update.sh
#
# Pasos: git pull (solo fast-forward) -> build de la imagen nueva (la app
# sigue corriendo) -> stop -> respaldo de data/ verificado -> recrear
# contenedores -> verificar HTTP, integridad y conteos de la BD.
# Respaldos en ~/usaplates-backups/<fecha>/ (se conservan los últimos 10).
set -euo pipefail

main() {
    local app_dir backups ts bk old new compose before after
    app_dir="$(cd "$(dirname "$0")/.." && pwd)"
    backups="$HOME/usaplates-backups"
    cd "$app_dir"

    if command -v podman-compose >/dev/null; then compose="podman-compose"
    elif podman compose version >/dev/null 2>&1; then compose="podman compose"
    else die "no se encontró podman-compose ni 'podman compose'"; fi

    [ -f data/db.sqlite3 ] || die "no existe $app_dir/data/db.sqlite3"
    [ -f .env ] || die "no existe $app_dir/.env"
    git diff --quiet && git diff --cached --quiet \
        || die "hay cambios locales en archivos versionados (ver 'git status'); resuélvelos antes de actualizar"

    say "Buscando cambios en GitHub"
    git fetch origin
    old="$(git rev-parse HEAD)"
    new="$(git rev-parse '@{u}')"
    if [ "$old" = "$new" ]; then
        echo "Ya está en la última versión ($(git log -1 --format='%h %s'))."
        exit 0
    fi
    git log --oneline "$old..$new"
    git merge --ff-only '@{u}'

    say "Construyendo imagen nueva (la app sigue corriendo)"
    if ! $compose build web; then
        git reset --hard "$old"
        die "falló el build; el código volvió a la versión anterior y la app sigue corriendo"
    fi

    say "Deteniendo la app y respaldando la base de datos"
    before="$(db_counts data/db.sqlite3)"
    $compose stop
    ts="$(date +%Y%m%d-%H%M%S)"
    bk="$backups/$ts"
    mkdir -p "$bk"
    cp -r --preserve=mode,timestamps data "$bk/data"
    cmp data/db.sqlite3 "$bk/data/db.sqlite3"
    [ "$(db_integrity "$bk/data/db.sqlite3")" = "ok" ] || die "el respaldo no pasó integrity_check (la app quedó detenida: '$compose start')"
    echo "$old" > "$bk/previous-commit"
    echo "Respaldo OK: $bk"

    say "Levantando la versión nueva"
    $compose down
    $compose up -d

    say "Verificando"
    for _ in $(seq 1 30); do
        curl -fsS -o /dev/null http://localhost:8000/api/states/ 2>/dev/null && break
        sleep 2
    done
    curl -fsS -o /dev/null http://localhost:8000/api/states/ || die "la app no responde en :8000 ('$compose logs web')"
    [ "$(db_integrity data/db.sqlite3)" = "ok" ] || die "integrity_check falló en la BD activa"
    after="$(db_counts data/db.sqlite3)"
    echo "Estados/patentes antes: $before | después: $after"
    [ "$before" = "$after" ] || die "los conteos cambiaron; respaldo en $bk"

    # Conservar solo los 10 respaldos más recientes
    ls -1d "$backups"/*/ 2>/dev/null | sort | head -n -10 | xargs -r rm -rf

    say "Listo: $(git log -1 --format='%h %s')"
    cat <<EOF
Para revertir:
  cd $app_dir && $compose down
  podman unshare mv data data.failed-$ts
  cp -r $bk/data data
  git reset --hard $old
  $compose build web && $compose up -d
EOF
}

db_counts() {
    python3 - "$1" <<'PY'
import sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
print(" ".join(str(db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
               for t in ("plates_state", "plates_sighting")))
PY
}

db_integrity() {
    python3 - "$1" <<'PY'
import sqlite3, sys
print(sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True).execute("PRAGMA integrity_check").fetchone()[0])
PY
}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORTADO: %s\033[0m\n' "$*" >&2; exit 1; }

# Todo va dentro de main() para que bash lea el script completo antes de
# ejecutarlo: git merge puede reemplazar este mismo archivo a mitad de camino.
main "$@"
