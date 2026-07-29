from rest_framework import serializers

from .models import Sighting, State


class StateListSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = State
        fields = ["code", "name", "status"]

    def get_status(self, obj):
        people = {s.person for s in obj.sightings.all()}
        has_el = Sighting.EL in people
        has_ella = Sighting.ELLA in people
        if has_el and has_ella:
            return "both"
        if has_el:
            return "him"
        if has_ella:
            return "her"
        return "none"


class StateDetailSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    him = serializers.SerializerMethodField()
    her = serializers.SerializerMethodField()
    first_seen = serializers.SerializerMethodField()
    last_modified = serializers.SerializerMethodField()

    class Meta:
        model = State
        fields = ["code", "name", "status", "him", "her", "first_seen", "last_modified"]

    def _sightings_by_person(self, obj):
        if not hasattr(obj, "_sightings_cache"):
            obj._sightings_cache = {s.person: s for s in obj.sightings.all()}
        return obj._sightings_cache

    def _person_payload(self, obj, person):
        sighting = self._sightings_by_person(obj).get(person)
        if sighting is None:
            return {"seen": False, "first_seen": None, "last_modified": None}
        return {
            "seen": True,
            "first_seen": sighting.first_seen,
            "last_modified": sighting.last_modified,
        }

    def get_him(self, obj):
        return self._person_payload(obj, Sighting.EL)

    def get_her(self, obj):
        return self._person_payload(obj, Sighting.ELLA)

    def get_status(self, obj):
        people = self._sightings_by_person(obj)
        has_el = Sighting.EL in people
        has_ella = Sighting.ELLA in people
        if has_el and has_ella:
            return "both"
        if has_el:
            return "him"
        if has_ella:
            return "her"
        return "none"

    def get_first_seen(self, obj):
        dates = [s.first_seen for s in self._sightings_by_person(obj).values()]
        return min(dates) if dates else None

    def get_last_modified(self, obj):
        dates = [s.last_modified for s in self._sightings_by_person(obj).values()]
        return max(dates) if dates else None
