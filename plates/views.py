import json

from django.db import transaction
from django.shortcuts import render
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Sighting, State
from .serializers import StateDetailSerializer, StateListSerializer

VALID_PERSONS = {"el": Sighting.EL, "ella": Sighting.ELLA}


def index(request):
    fips_to_code = {s.fips: s.code for s in State.objects.all()}
    context = {"fips_to_code_json": json.dumps(fips_to_code)}
    return render(request, "plates/index.html", context)


def _person_or_400(raw):
    person = VALID_PERSONS.get((raw or "").lower())
    if person is None:
        raise ParseError("El campo 'person' debe ser 'el' o 'ella'.")
    return person


def _get_state_or_404(code):
    try:
        return State.objects.prefetch_related("sightings").get(code=code.upper())
    except State.DoesNotExist:
        raise NotFound(f"Estado '{code}' no existe.")


def _touch(state):
    State.objects.filter(pk=state.pk).update(last_changed=timezone.now())


class StateListView(APIView):
    def get(self, request):
        states = State.objects.prefetch_related("sightings").all()
        return Response(StateListSerializer(states, many=True).data)


class StateDetailView(APIView):
    def get(self, request, code):
        state = _get_state_or_404(code)
        return Response(StateDetailSerializer(state).data)


class SightingView(APIView):
    """Mark or unmark a sighting for a given state + person."""

    def put(self, request, code, person):
        state = _get_state_or_404(code)
        person_key = _person_or_400(person)
        # get_or_create (not update_or_create) so re-marking an already-seen
        # state is a true no-op and doesn't bump any timestamp.
        with transaction.atomic():
            _, created = Sighting.objects.get_or_create(state=state, person=person_key)
            if created:
                _touch(state)
        state = _get_state_or_404(code)
        return Response(StateDetailSerializer(state).data, status=status.HTTP_200_OK)

    def delete(self, request, code, person):
        state = _get_state_or_404(code)
        person_key = _person_or_400(person)
        with transaction.atomic():
            deleted, _ = Sighting.objects.filter(state=state, person=person_key).delete()
            if deleted:
                _touch(state)
        state = _get_state_or_404(code)
        return Response(StateDetailSerializer(state).data, status=status.HTTP_200_OK)
