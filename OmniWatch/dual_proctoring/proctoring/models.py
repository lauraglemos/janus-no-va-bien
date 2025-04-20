from django.contrib.auth.models import AbstractUser
from django.db import models
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser

# Modelo de usuario con rol
class User(AbstractUser):
    ROLE_CHOICES = [
        ('profesor', 'Profesor'),
        ('alumno', 'Alumno'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='alumno')

User = get_user_model()

class Exam(models.Model):
    subject = models.CharField(max_length=100)
    date = models.DateField()
    time = models.TimeField()
    password = models.CharField(max_length=20)
    
    def __str__(self):
        return f"{self.subject} - {self.date} {self.time}"

class ExamEnrollment(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'exam')  # Evita inscripciones duplicadas

class LiveStream(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    stream_url = models.URLField()
    started_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Live {self.student.username} - {self.exam.subject}"

class ExamRecording(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    video_url = models.URLField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Recording {self.student.username} - {self.exam.subject}"

class CheatAlert(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    alert_type = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.TextField()

    def __str__(self):
        return f"ALERT {self.student.username} - {self.alert_type}"
