from django.db import models


class State(models.Model):
    """One of the 50 US states plus DC, identified by its 2-letter postal code."""

    code = models.CharField(max_length=2, primary_key=True)
    name = models.CharField(max_length=64, unique=True)
    fips = models.CharField(max_length=2, unique=True)
    # Time of the last mark/unmark of any sighting. Kept on the state because
    # an unmark deletes the sighting row and its own timestamp with it.
    last_changed = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Sighting(models.Model):
    """Records that a given person has spotted a license plate from a state."""

    EL = "EL"
    ELLA = "ELLA"
    PERSON_CHOICES = [
        (EL, "Él"),
        (ELLA, "Ella"),
    ]

    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name="sightings")
    person = models.CharField(max_length=4, choices=PERSON_CHOICES)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["state", "person"], name="unique_state_person")
        ]

    def __str__(self):
        return f"{self.state_id} - {self.get_person_display()}"
