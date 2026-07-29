from django.contrib import admin

from .models import Sighting, State


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "fips")
    search_fields = ("code", "name")


@admin.register(Sighting)
class SightingAdmin(admin.ModelAdmin):
    list_display = ("state", "person", "first_seen", "last_modified")
    list_filter = ("person",)
    autocomplete_fields = ("state",)
