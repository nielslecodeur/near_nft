#define _GNU_SOURCE
#include <time.h>
#include <sys/time.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <pthread.h>
static pthread_once_t once=PTHREAD_ONCE_INIT;
static struct timespec wall_start, mono_start;
static void initialize(void){syscall(SYS_clock_gettime,CLOCK_REALTIME,&wall_start);syscall(SYS_clock_gettime,CLOCK_MONOTONIC,&mono_start);}
int clock_gettime(clockid_t id,struct timespec *result){
  if(id!=CLOCK_REALTIME && id!=CLOCK_REALTIME_COARSE)return syscall(SYS_clock_gettime,id,result);
  pthread_once(&once,initialize);struct timespec mono;if(syscall(SYS_clock_gettime,CLOCK_MONOTONIC,&mono))return -1;
  result->tv_sec=wall_start.tv_sec+mono.tv_sec-mono_start.tv_sec;
  result->tv_nsec=wall_start.tv_nsec+mono.tv_nsec-mono_start.tv_nsec;
  if(result->tv_nsec<0){result->tv_nsec+=1000000000;result->tv_sec--;}
  if(result->tv_nsec>=1000000000){result->tv_nsec-=1000000000;result->tv_sec++;}return 0;
}
int gettimeofday(struct timeval *tv, void *tz){(void)tz;struct timespec t;if(clock_gettime(CLOCK_REALTIME,&t))return -1;tv->tv_sec=t.tv_sec;tv->tv_usec=t.tv_nsec/1000;return 0;}
time_t time(time_t *out){struct timespec t;clock_gettime(CLOCK_REALTIME,&t);if(out)*out=t.tv_sec;return t.tv_sec;}
int timespec_get(struct timespec *out,int base){if(base!=TIME_UTC)return 0;return clock_gettime(CLOCK_REALTIME,out)==0?base:0;}
