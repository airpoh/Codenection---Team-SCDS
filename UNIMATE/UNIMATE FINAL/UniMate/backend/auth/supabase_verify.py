"""
Supabase JWT 验证模块
用于验证 Supabase 签发的 JWT 令牌
"""

from jose import jwt
from cachetools import TTLCache
import httpx
import time
from typing import Dict, Any


# JWKS 缓存，1小时过期
_jwks_cache = TTLCache(maxsize=1, ttl=3600)


def _jwks_url(project_ref: str) -> str:
    """构建 JWKS URL"""
    return f"https://{project_ref}.supabase.co/auth/v1/.well-known/jwks.json"


async def get_jwks(project_ref: str) -> Dict[str, Any]:
    """获取 JWKS（JSON Web Key Set）"""
    if 'jwks' in _jwks_cache:
        return _jwks_cache['jwks']
    
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            response = await client.get(_jwks_url(project_ref))
            response.raise_for_status()
            jwks = response.json()
            _jwks_cache['jwks'] = jwks
            return jwks
        except httpx.HTTPError as e:
            raise Exception(f"获取 JWKS 失败: {e}")


async def verify_supabase_token(token: str, project_ref: str) -> Dict[str, Any]:
    """
    验证 Supabase JWT 令牌
    
    Args:
        token: Supabase JWT 令牌
        project_ref: Supabase 项目引用（项目 URL 中的子域名前缀）
    
    Returns:
        JWT 载荷（包含用户信息）
    
    Raises:
        Exception: 令牌验证失败
    """
    try:
        jwks = await get_jwks(project_ref)
        
        # 验证 JWT 令牌
        payload = jwt.decode(
            token,
            jwks,  # jose 接受 JWKS 字典
            algorithms=["RS256"],
            options={"verify_aud": False},  # Supabase 令牌可能不包含预期的 aud
            issuer=f"https://{project_ref}.supabase.co/auth/v1"
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise Exception("令牌已过期")
    except jwt.JWTClaimsError as e:
        raise Exception(f"令牌声明验证失败: {e}")
    except jwt.JWTError as e:
        raise Exception(f"令牌验证失败: {e}")
    except Exception as e:
        raise Exception(f"验证过程中发生错误: {e}")
