namespace ProjectManager.Core.Interfaces;

// 현재 요청의 actor (X-Atlas-Actor 헤더로 들어온 사용자 표시명) 를 가져온다.
// AppHost 가 IHttpContextAccessor 로 구현. 디자인타임(dotnet ef) 이나 비-HTTP 컨텍스트에서는 빈 문자열.
// 인증 아닌 메타데이터 마커 — 권한 결정에 쓰지 말 것.
public interface IActorAccessor
{
    string GetActor();
}
