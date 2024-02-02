import { fetchRedis } from "./redis"

export const getFriendsByUserId= async(userId:string) => {
    //Getting the friends for current user

    const friendIds= await fetchRedis('smembers', `user:${userId}:friends`) as string[]

    const friends= await Promise.all(       //it calls everything here simultanously i.e it paases an array of promises and calls everything all at once
        friendIds.map(async(friendId)=>{
            const friend= await fetchRedis('get', `user:${friendId}`) as string
            const parsedFriend= JSON.parse(friend) as User
            return parsedFriend
        })
    )
    return friends
}