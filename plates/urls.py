from django.urls import path

from . import views

app_name = "plates"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/states/", views.StateListView.as_view(), name="state-list"),
    path("api/states/<str:code>/", views.StateDetailView.as_view(), name="state-detail"),
    path(
        "api/states/<str:code>/sightings/<str:person>/",
        views.SightingView.as_view(),
        name="sighting-detail",
    ),
]
