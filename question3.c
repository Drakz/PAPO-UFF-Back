#include <stdio.h>

int funcao(int x, int y){
return x + y;
}

int main(){
	int a,b;
	scanf("%d", &a);
scanf("%d", &b);
	printf("%d", funcao(a,b));
	return 0;
}