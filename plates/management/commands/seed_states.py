from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Loads/updates the 50 states + DC. Safe to run every startup (upsert by PK)."""

    help = "Seeds the State table from plates/fixtures/states.json"

    def handle(self, *args, **options):
        call_command("loaddata", "states")
        self.stdout.write(self.style.SUCCESS("Estados cargados/actualizados."))
