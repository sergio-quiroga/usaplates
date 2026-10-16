import json
from pathlib import Path

from django.core.management.base import BaseCommand

from plates.models import State

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "states.json"


class Command(BaseCommand):
    """Loads/updates the 50 states + DC. Safe to run every startup.

    Only touches the fields present in the fixture (name, fips), so runtime
    data such as State.last_changed survives container restarts. (loaddata
    would overwrite the whole row and reset it to NULL.)
    """

    help = "Seeds the State table from plates/fixtures/states.json"

    def handle(self, *args, **options):
        entries = json.loads(FIXTURE.read_text(encoding="utf-8"))
        for entry in entries:
            State.objects.update_or_create(pk=entry["pk"], defaults=entry["fields"])
        self.stdout.write(self.style.SUCCESS("Estados cargados/actualizados."))
