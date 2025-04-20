from django.urls import path
from . import views
from .views import delete_exam, edit_exam, dashboard_exam, exam_access, create_exam, student_dashboard, manage_exams, user_login, RegisterView, LoginView, ExamListCreateView, ExamDetailView, ExamEnrollmentView, LiveStreamListView, ExamRecordingListView, CheatAlertListView, dashboard, live_streams, exam_recordings, cheat_alerts,  exam_monitor

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    #path('login/', LoginView.as_view(), name='login'),
    #path('exams/', ExamListCreateView.as_view(), name='exam-list-create'),
    #path('exams/<int:pk>/', ExamDetailView.as_view(), name='exam-detail'),
    #path('exams/enroll/', ExamEnrollmentView.as_view(), name='exam-enroll'),
    path('livestreams/', LiveStreamListView.as_view(), name='live-streams'),
    path('recordings/', ExamRecordingListView.as_view(), name='exam-recordings'),
    path('alerts/', CheatAlertListView.as_view(), name='cheat-alerts'),
    path('dashboard/', dashboard, name='dashboard'),
    path("dashboard/exam/<int:exam_id>/", dashboard_exam, name="dashboard_exam"),
     path("dashboard/exam/monitor/<int:exam_id>/", views.exam_monitor, name="exam_monitor"),
    #path('live-streams/', live_streams, name='live-streams'),
    #path('exam-recordings/', exam_recordings, name='exam-recordings'),
    #path('cheat-alerts/', cheat_alerts, name='cheat-alerts'),
    path("dashboard/exam/<int:exam_id>/live_streams/", live_streams, name="live_streams"),
    path("dashboard/exam/<int:exam_id>/recordings/", exam_recordings, name="exam_recordings"),
    path("dashboard/exam/<int:exam_id>/cheat_alerts/", cheat_alerts, name="cheat_alerts"),
    path("login/", user_login, name="login"),
    path("manage-exams/", manage_exams, name="manage_exams"),
    path("student-dashboard/", student_dashboard, name="student_dashboard"),
    path("create-exam/", create_exam, name="create_exam"),
    path("exam-access/<int:exam_id>/", exam_access, name="exam_access"),
    path('edit-exam/<int:exam_id>/', edit_exam, name='edit_exam'),
    path('delete-exam/<int:exam_id>/', delete_exam, name='delete_exam'),
    path("exam-page/<int:exam_id>/", views.exam_page, name="exam_page"),


]
