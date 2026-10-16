from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from .models import Sighting, State


class SightingFlowTests(TestCase):
    fixtures = ["states"]

    def setUp(self):
        self.state = State.objects.get(code="CA")

    def test_state_starts_unseen(self):
        resp = self.client.get(reverse("plates:state-detail", args=["CA"]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "none")

    def test_marking_both_people_gives_both_status(self):
        self.client.put(reverse("plates:sighting-detail", args=["CA", "el"]))
        self.client.put(reverse("plates:sighting-detail", args=["CA", "ella"]))

        resp = self.client.get(reverse("plates:state-detail", args=["CA"]))
        data = resp.json()
        self.assertEqual(data["status"], "both")
        self.assertTrue(data["him"]["seen"])
        self.assertTrue(data["her"]["seen"])

    def test_unmarking_removes_sighting(self):
        self.client.put(reverse("plates:sighting-detail", args=["CA", "el"]))
        self.client.delete(reverse("plates:sighting-detail", args=["CA", "el"]))

        self.assertFalse(Sighting.objects.filter(state=self.state, person=Sighting.EL).exists())

    def test_invalid_person_returns_400(self):
        resp = self.client.put(reverse("plates:sighting-detail", args=["CA", "amigo"]))
        self.assertEqual(resp.status_code, 400)

    def test_unknown_state_returns_404(self):
        resp = self.client.get(reverse("plates:state-detail", args=["ZZ"]))
        self.assertEqual(resp.status_code, 404)

    def test_repeated_put_is_idempotent_and_keeps_first_seen(self):
        url = reverse("plates:sighting-detail", args=["CA", "el"])
        first = self.client.put(url).json()
        second = self.client.put(url).json()
        self.assertEqual(first["him"]["first_seen"], second["him"]["first_seen"])

    def test_repeated_put_does_not_bump_last_modified(self):
        url = reverse("plates:sighting-detail", args=["CA", "el"])
        first = self.client.put(url).json()
        second = self.client.put(url).json()
        self.assertEqual(first["last_modified"], second["last_modified"])
        self.assertEqual(first["him"]["last_modified"], second["him"]["last_modified"])

    def test_unmarking_one_person_advances_last_modified(self):
        self.client.put(reverse("plates:sighting-detail", args=["CA", "ella"]))
        before = self.client.put(reverse("plates:sighting-detail", args=["CA", "el"])).json()
        after = self.client.delete(reverse("plates:sighting-detail", args=["CA", "el"])).json()
        self.assertGreater(after["last_modified"], before["last_modified"])

    def test_seed_states_keeps_last_changed(self):
        self.client.put(reverse("plates:sighting-detail", args=["CA", "el"]))
        self.client.delete(reverse("plates:sighting-detail", args=["CA", "el"]))
        before = State.objects.get(code="CA").last_changed
        self.assertIsNotNone(before)

        call_command("seed_states", stdout=StringIO())

        self.assertEqual(State.objects.get(code="CA").last_changed, before)
        self.assertEqual(State.objects.count(), 51)
