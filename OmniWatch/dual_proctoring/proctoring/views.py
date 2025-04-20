from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterSerializer, LoginSerializer, ExamEnrollmentSerializer, ExamSerializer, LiveStream, LiveStreamSerializer, ExamRecording, ExamRecordingSerializer, CheatAlert, CheatAlertSerializer
from .models import Exam, ExamEnrollment
from django.shortcuts import render
from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from .forms import ExamForm
from django.shortcuts import get_object_or_404
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib import messages


from django.http import JsonResponse
import os
import json
from django.conf import settings

RECORDINGS_DIR = os.path.join(settings.MEDIA_ROOT, 'recordings')
RECORDINGS_URL = settings.MEDIA_URL + 'recordings/'


@login_required
def delete_exam(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)

    if request.method == 'POST':
        exam.delete()
        messages.success(request, 'Examen eliminado correctamente.')
        return redirect('manage_exams')  # O 'manage_exams' si usas ese nombre

    return render(request, 'proctoring/delete_exam.html', {'exam': exam})




def edit_exam(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)

    if request.method == 'POST':
        form = ExamForm(request.POST, instance=exam)
        if form.is_valid():
            form.save()
            messages.success(request, 'Examen actualizado correctamente.')
            return redirect('manage_exams')
    else:
        form = ExamForm(instance=exam)

    return render(request, 'proctoring/edit_exam.html', {'form': form, 'exam': exam})



@login_required
def exam_access(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)

    if request.method == "POST":
        entered_password = request.POST["password"]
        if entered_password == exam.password:
            return redirect("exam_page", exam_id=exam.id)  # Redirigir a la página del examen
        else:
            return render(request, "proctoring/student_dashboard.html", {
                "exams": Exam.objects.all(),
                "error": "Contraseña incorrecta",
            })

    return redirect("student_dashboard")

@login_required
def create_exam(request):
    if request.user.role != "profesor":
        return redirect("dashboard")

    if request.method == "POST":
        form = ExamForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Examen creado correctamente.')
            return redirect("manage_exams")
    else:
        form = ExamForm()

    return render(request, "proctoring/create_exam.html", {"form": form})


@login_required
def manage_exams(request):
    if request.user.role != "profesor":
        return redirect("dashboard")

    exams = Exam.objects.all()
    return render(request, "proctoring/manage_exams.html", {"exams": exams})

@login_required
def student_dashboard(request):
    exams = Exam.objects.all()  
    return render(request, "proctoring/student_dashboard.html", {"exams": exams})


def user_login(request):
    if request.method == "POST":
        username = request.POST["username"]
        password = request.POST["password"]
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            if user.role == "profesor":
                return redirect("dashboard")
            else:
                return redirect("student_dashboard")
        else:
            return render(request, "proctoring/login.html", {"error": "Credenciales incorrectas"})
    return render(request, "proctoring/login.html")


def dashboard(request):
    exams = Exam.objects.all()
    return render(request, "proctoring/dashboard.html", {"exams": exams})

@login_required
def dashboard_exam(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)
    return render(request, "proctoring/dashboard_exam.html", {"exam": exam})

User = get_user_model()

# Registro de usuario
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

# Login de usuario
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer

# Crear y listar exámenes (sólo profesores)
class ExamListCreateView(generics.ListCreateAPIView):
    queryset = Exam.objects.all()
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    

# Ver detalles de un examen
class ExamDetailView(generics.RetrieveAPIView):
    queryset = Exam.objects.all()
    serializer_class = ExamSerializer

# Inscribirse a un examen (sólo alumnos)
class ExamEnrollmentView(generics.CreateAPIView):
    queryset = ExamEnrollment.objects.all()
    serializer_class = ExamEnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

# Ver transmisiones en vivo (sólo profesores)
class LiveStreamListView(generics.ListAPIView):
    queryset = LiveStream.objects.all()
    serializer_class = LiveStreamSerializer
    permission_classes = [permissions.IsAuthenticated]

# Ver grabaciones de exámenes (sólo profesores)
class ExamRecordingListView(generics.ListAPIView):
    queryset = ExamRecording.objects.all()
    serializer_class = ExamRecordingSerializer
    permission_classes = [permissions.IsAuthenticated]

# Ver alertas de trampas (sólo profesores)
class CheatAlertListView(generics.ListAPIView):
    queryset = CheatAlert.objects.all()
    serializer_class = CheatAlertSerializer
    permission_classes = [permissions.IsAuthenticated]

def live_streams(request, exam_id):
    #streams = LiveStream.objects.all()
    return render(request, "proctoring/live_streams.html", {"exam_id": exam_id})

def exam_recordings(request, exam_id):
    #recordings = ExamRecording.objects.all()
    return render(request, "proctoring/exam_recordings.html", {"exam_id": exam_id})

def cheat_alerts(request, exam_id):
    #alerts = CheatAlert.objects.all()
    return render(request, "proctoring/cheat_alerts.html", {"exam_id": exam_id})


@login_required
def exam_monitor(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)
    # DEBUG:
    print(">>> DEBUG en view exam_monitor: request.user.role =", repr(request.user.role))
    es_profesor = (request.user.role == "profesor")
    return render(request, "proctoring/exam_monitor.html", {
        'user': request.user,
        'is_teacher': es_profesor,
        'exam_id': exam_id,
        'exam': exam,
    })

@login_required
def exam_page(request, exam_id):
    exam = get_object_or_404(Exam, id=exam_id)
    
    # Asegurar que solo estudiantes acceden
    if request.user.role == "profesor":
        return redirect("dashboard")
    
    context = {
        'user': request.user,
        'exam': exam,
        'exam_id': exam_id,
    }
    
    return render(request, "proctoring/exam_page.html", context)


@login_required
def api_student_list(request):
    """Devuelve la lista de estudiantes con grabaciones disponibles"""
    if request.user.role != "profesor":
        return JsonResponse({'error': 'Acceso denegado'}, status=403)
        
    try:
        # Comprobar si el directorio existe
        if not os.path.exists(RECORDINGS_DIR):
            return JsonResponse([], safe=False)
            
        # Obtener directorios de estudiantes
        student_dirs = [d for d in os.listdir(RECORDINGS_DIR) 
                     if os.path.isdir(os.path.join(RECORDINGS_DIR, d))]
                     
        # Cargar metadatos si existe
        metadata_path = os.path.join(RECORDINGS_DIR, 'recordings.json')
        metadata = []
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        
        students = []
        for student_id in student_dirs:
            # Contar grabaciones por tipo
            student_recordings = [rec for rec in metadata if rec['studentId'] == student_id]
            video_count = len([rec for rec in student_recordings if rec['type'] == 'video'])
            audio_count = len([rec for rec in student_recordings if rec['type'] == 'audio'])
            
            # Obtener información del último registro
            last_recording = None
            if student_recordings:
                # Ordenar por timestamp en orden descendente
                sorted_recordings = sorted(student_recordings, key=lambda x: x.get('timestamp', 0), reverse=True)
                if sorted_recordings:
                    last_timestamp = sorted_recordings[0].get('timestamp', 0)
                    last_recording = sorted_recordings[0].get('date', 'Desconocido')
            
            # Buscar información del estudiante en el modelo User si se necesita
            # Por ahora, solo usamos el ID
            
            students.append({
                'id': student_id,
                'name': f'Alumno {student_id}',  # Aquí se podría obtener el nombre real del estudiante
                'recordings': {
                    'video': video_count,
                    'audio': audio_count,
                    'total': len(student_recordings)
                },
                'lastRecording': last_recording
            })
            
        return JsonResponse(students, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
def api_student_recordings(request, student_id):
    """Devuelve las grabaciones de un estudiante específico"""
    if request.user.role != "profesor":
        return JsonResponse({'error': 'Acceso denegado'}, status=403)
        
    try:
        # Comprobar si el directorio del estudiante existe
        student_dir = os.path.join(RECORDINGS_DIR, student_id)
        if not os.path.exists(student_dir):
            return JsonResponse([], safe=False)
            
        # Cargar metadatos si existe
        metadata_path = os.path.join(RECORDINGS_DIR, 'recordings.json')
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                all_metadata = json.load(f)
                
            # Filtrar solo las grabaciones del estudiante
            student_recordings = [rec for rec in all_metadata if rec['studentId'] == student_id]
            
            # Ordenar por fecha descendente
            student_recordings.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
            
            return JsonResponse(student_recordings, safe=False)
        
        # Si no hay metadatos, buscamos los archivos directamente
        recordings = []
        for filename in os.listdir(student_dir):
            file_path = os.path.join(student_dir, filename)
            if os.path.isfile(file_path):
                # Determinar tipo de archivo
                file_type = 'video' if filename.endswith('.webm') else 'audio' if filename.endswith('.wav') else 'unknown'
                
                # Extraer información del nombre
                parts = filename.split('_')
                if len(parts) >= 3:
                    exam = parts[0]
                    timestamp = parts[2].split('.')[0]
                else:
                    exam = 'unknown'
                    timestamp = '0'
                
                # Obtener tamaño del archivo
                size_bytes = os.path.getsize(file_path)
                size = format_file_size(size_bytes)
                
                recordings.append({
                    'id': f"{student_id}_{os.path.splitext(filename)[0]}",
                    'exam': exam,
                    'studentId': student_id,
                    'timestamp': int(timestamp) if timestamp.isdigit() else 0,
                    'date': timestamp,
                    'type': file_type,
                    'filename': filename,
                    'path': f"/{student_id}/{filename}",
                    'url': f"{RECORDINGS_URL}{student_id}/{filename}",
                    'size': size
                })
                
            # Ordenar por fecha descendente
            recordings.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
                
        return JsonResponse(recordings, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

def format_file_size(size_bytes):
    """Formatea el tamaño en bytes a una forma legible"""
    if size_bytes == 0:
        return "0B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    i = 0
    while size_bytes >= 1024 and i < len(size_name)-1:
        size_bytes /= 1024
        i += 1
    return f"{size_bytes:.2f} {size_name[i]}"
